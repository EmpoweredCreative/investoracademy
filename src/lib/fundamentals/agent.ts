import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BUCKET_LABELS, type Bucket } from "@/lib/buckets";
import { evaluateCriteria, metricValuesFromSnapshot, METRICS, ruleText, type CriteriaProfile } from "./criteria";
import { evaluateSnapshot, fxForSnapshot } from "./research";
import { dcfAssumptionsSchema, type DcfAssumptions } from "./dcf";
import { computeDcf, getDcfContext, saveDcfModel } from "./dcfService";
import { fetchYahooFundamentals, refreshSymbolFundamentals } from "./yahooFundamentals";
import { statementFx } from "@/lib/marketdata/fx";
import { ANALYST_NAME, APP_NAME } from "@/lib/brand";
import type { Lens } from "@/lib/research/lenses";
import { digestOf, ensureDigests, ensureFilings, riskChanges } from "@/lib/sec/filings";
import { SECTION_KEYS, SECTION_LABELS, type AnnualForm, type SectionKey } from "@/lib/sec/sections";
import { getCompanyFinancials } from "@/lib/research/company";
import { latestReport, type CompanyReportBody } from "@/lib/research/report";
import { createReportJob, runReportJob } from "@/lib/research/reportJobs";
import { getMacroSnapshot, getOwnershipAndMomentum, getPriceTrend } from "@/lib/research/marketContext";
import { runScreen } from "@/lib/finviz/client";
import { getFinvizToken } from "@/lib/finviz/credentials";
import { getCompanyScore } from "@/lib/research/scoreService";
import { SCORE_NAME } from "@/lib/research/score";
import { describeFilter, FILTERS } from "@/lib/finviz/filters";

export const RESEARCH_MODEL = "claude-opus-5-5";

/** Events streamed to the browser as newline-delimited JSON. */
export type AgentEvent =
  | { t: "text"; d: string }
  | { t: "tool_start"; id: string; name: string; label: string }
  | { t: "tool_end"; id: string; name: string; summary: string; ok: boolean }
  | { t: "proposal"; symbol: string; verdict?: string | null; notes?: string | null; reason: string }
  | { t: "watchlist"; symbol: string }
  | {
      t: "report";
      symbol: string;
      lensKey: string;
      lensName: string;
      verdict: string;
      score: number;
      moat: string;
      oneLine: string;
      greatestRisk: string | null;
    }
  | { t: "error"; message: string }
  | { t: "done" };

export interface ToolEventRecord {
  name: string;
  label: string;
  summary: string;
  ok: boolean;
}

/** Stable instructions — cached across turns and symbols. */
export const RESEARCH_SYSTEM_PROMPT = `You are the ${ANALYST_NAME}, the research analyst inside ${APP_NAME}, an investor's wealth and trading desk app. If asked what you are, say you're the ${ANALYST_NAME}, powered by Claude. You help them do fundamental analysis on individual stocks, judged against THEIR OWN criteria, and build discounted cash flow (DCF) models. They talk to you like a colleague: questions can be about one stock, several, their whole watchlist, their holdings, or their criteria themselves.

How you work:
- Every stock tool takes a ticker. Only the tools that load live fundamentals (get_fundamentals, evaluate_criteria, get_financial_history, run_dcf, generate_company_report) add a new ticker to the watchlist, and the app already shows the user when that happens, so don't mention the watchlist yourself. For questions across many names, start with list_watchlist or list_my_holdings rather than looking stocks up one by one.
- Use your tools for every number. Never invent or recall figures from memory; if a tool doesn't return it, say it's unavailable.
- Criteria pass/fail comes from evaluate_criteria, which applies the user's own thresholds in code. Quote the rule when you comment (e.g. "PEG 1.8 misses your ≤ 1.0 good / ≤ 1.5 ok rule"). Don't re-judge thresholds yourself; you may suggest the user revisit a threshold if it looks miscalibrated for this kind of business.
- For DCF work, start from get_financial_history and the suggested assumptions, then reason about them out loud: compare growth assumptions to historical FCF and revenue CAGR, note when free cash flow is depressed or inflated by one-offs (heavy capex cycles, working-capital swings, stock comp), and test alternatives with run_dcf. Show bear/base/bull when it matters. Flag when most of the value sits in the terminal value.
- For questions about the business itself (what it does, competitive advantage, moat, greatest risks, management), ground your answer in the company's annual reports: start with get_filing_digests, use compare_risk_factors for what's changing, read_filing_section to check or quote, and get_long_term_financials for 10-year consistency. Cite sources inline like "(10-K FY2024, Risk Factors)".
- For "which is best", ranking or "how good is X overall", use get_wealthos_score (list_watchlist shows saved scores where they exist). Explain the score through its pillars and caps rather than inventing your own number.
- When the user asks you to research a company with a lens active (e.g. "Research KO"), call generate_company_report. The app shows a report card, so reply with a short synthesis of the key findings and offer follow-ups rather than repeating the report.
- Use get_my_criteria when they ask about their rules or whether a threshold makes sense.
- Use get_my_position to connect research to what they actually hold: bucket (Core / Speculation / Free Money), shares, cost, core premium plan.
- Only call propose_research_update when the user asks you to record a verdict or notes; the user confirms it in the app.
- This is education and analysis, not personalized advice. Don't tell them to buy or sell; lay out the evidence, what would change the picture, and what to check next.

Style: lead with the answer in a sentence or two, then the supporting numbers as a short list or small table. Use Markdown (bold, bullet lists, simple tables). Keep it tight.`;

interface AgentContext {
  userId: string;
  accountId: string;
  /** Stock the user is viewing; null on the research desk. */
  symbol: string | null;
  /** Criteria used for scoring: the lens preset when a lens is active, else the user's own. */
  profile: CriteriaProfile;
  lens: Lens | null;
  emit: (e: AgentEvent) => void;
  toolLog: ToolEventRecord[];
}

const fmt = (n: number | null | undefined, d = 2) => (n == null ? null : Number(n.toFixed(d)));

/** Wrap a tool's run() so the UI sees start/finish and we keep a log. */
function tracked<T>(
  ctx: AgentContext,
  name: string,
  label: (input: T) => string,
  run: (input: T) => Promise<{ result: unknown; summary: string }>
) {
  return async (input: T) => {
    const id = `${name}-${Math.random().toString(36).slice(2, 8)}`;
    let l = name;
    try {
      l = label(input);
    } catch {
      // Bad input (e.g. an invalid ticker) surfaces as the tool's error below.
    }
    ctx.emit({ t: "tool_start", id, name, label: l });
    try {
      const { result, summary } = await run(input);
      ctx.emit({ t: "tool_end", id, name, summary, ok: true });
      ctx.toolLog.push({ name, label: l, summary, ok: true });
      return JSON.stringify(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.emit({ t: "tool_end", id, name, summary: message, ok: false });
      ctx.toolLog.push({ name, label: l, summary: message, ok: false });
      return JSON.stringify({ error: message });
    }
  };
}

const SNAPSHOT_MAX_AGE_MS = 24 * 3600_000;

function buildTools(ctx: AgentContext) {
  const { accountId } = ctx;

  const tickerSchema = z
    .string()
    .min(1)
    .max(10)
    .describe(ctx.symbol ? `Ticker symbol; defaults to ${ctx.symbol}, the stock being viewed` : "Ticker symbol, e.g. MSFT");
  const tickerInput = z.object({ symbol: ctx.symbol ? tickerSchema.optional() : tickerSchema });
  const resolve = (input: { symbol?: string }) => {
    const sym = (input.symbol ?? ctx.symbol ?? "").trim().toUpperCase().replace(/^\$/, "");
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(sym)) throw new Error(`"${input.symbol ?? ""}" isn't a valid ticker.`);
    return sym;
  };

  // Load fundamentals, refreshing a missing or day-old snapshot once per turn per ticker.
  // Parallel tool calls share the promise. New tickers land on the watchlist.
  const snapshots = new Map<string, ReturnType<typeof readSnapshot>>();
  const readSnapshot = async (symbol: string) => {
    const where = { accountId_symbol: { accountId, symbol } };
    let snapshot = await prisma.fundamentalSnapshot.findUnique({ where });
    if (!snapshot || Date.now() - snapshot.fetchedAt.getTime() > SNAPSHOT_MAX_AGE_MS) {
      const listed = await prisma.fundamentalWatchlistItem.findUnique({ where, select: { id: true } });
      try {
        await refreshSymbolFundamentals(accountId, symbol);
        snapshot = await prisma.fundamentalSnapshot.findUnique({ where });
        if (!listed) ctx.emit({ t: "watchlist", symbol });
      } catch (err) {
        // Fall back to the cached snapshot; get_fundamentals reports its asOf date.
        if (!snapshot) {
          if (!listed) await prisma.fundamentalWatchlistItem.deleteMany({ where: { accountId, symbol } });
          throw new Error(`Couldn't load ${symbol} from Yahoo: ${err instanceof Error ? err.message : "lookup failed"}`);
        }
      }
    }
    if (!snapshot) throw new Error(`No fundamentals available for ${symbol}.`);
    return snapshot;
  };
  const loadSnapshot = (symbol: string) => {
    if (!snapshots.has(symbol)) snapshots.set(symbol, readSnapshot(symbol));
    return snapshots.get(symbol)!;
  };

  const latestMos = async (symbol: string) => {
    const m = await prisma.dcfModel.findFirst({ where: { accountId, symbol }, orderBy: { createdAt: "desc" }, select: { outputs: true } });
    const mos = (m?.outputs as { marginOfSafety?: number | null } | undefined)?.marginOfSafety;
    return typeof mos === "number" ? mos : null;
  };

  return [
    betaZodTool({
      name: "get_fundamentals",
      description: "Current valuation and quality metrics for a stock (price, P/E, PEG, EV/EBITDA, P/B, P/S, D/E, ROE, margins, growth, FCF yield, next earnings date).",
      inputSchema: tickerInput,
      run: tracked(ctx, "get_fundamentals", (i) => `Loading ${resolve(i)} fundamentals`, async (input) => {
        const symbol = resolve(input);
        const s = await loadSnapshot(symbol);
        const values = metricValuesFromSnapshot(s, { marginOfSafety: await latestMos(symbol), fx: await statementFx(s.raw) });
        return {
          result: {
            symbol,
            price: s.price?.toNumber() ?? null,
            asOf: s.fetchedAt.toISOString(),
            nextEarningsDate: s.nextEarningsDate?.toISOString().slice(0, 10) ?? null,
            metrics: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, fmt(v ?? null)])),
            units: "percent metrics are in percent (18 = 18%); multiples are plain numbers",
          },
          summary: `Price ${s.price?.toNumber().toFixed(2) ?? "n/a"} · ${Object.values(values).filter((v) => v != null).length} metrics`,
        };
      }),
    }),

    betaZodTool({
      name: "evaluate_criteria",
      description: "Score a stock against the user's own research criteria (their thresholds, weights and required rules). Returns each metric's status, the rule applied, a 0-100 weighted score and PASS/WATCH/FAIL.",
      inputSchema: tickerInput,
      run: tracked(ctx, "evaluate_criteria", (i) => `Checking ${resolve(i)} against your criteria`, async (input) => {
        const symbol = resolve(input);
        const s = await loadSnapshot(symbol);
        const e = evaluateCriteria(
          metricValuesFromSnapshot(s, { marginOfSafety: await latestMos(symbol), fx: await statementFx(s.raw) }),
          ctx.profile
        );
        return {
          result: {
            symbol,
            criteriaSource: ctx.lens ? `${ctx.lens.name}-style lens preset` : "the user's own criteria",
            score: e.score,
            passScore: e.passScore,
            verdict: e.verdict,
            failedRequired: e.failedRequired.map((k) => METRICS[k].name),
            rows: e.rows.map((r) => ({
              metric: r.name,
              value: r.formatted,
              status: r.status,
              rule: r.rule,
              required: r.required,
              weight: r.weight,
              warning: r.warning,
            })),
          },
          summary: `${symbol} ${e.verdict.replace("_", " ")} · score ${e.score ?? "n/a"}/${e.passScore} · ${e.counts.green} green, ${e.counts.yellow} yellow, ${e.counts.red} red`,
        };
      }),
    }),

    betaZodTool({
      name: "get_financial_history",
      description: "Annual free cash flow, operating cash flow, capex, revenue, net income, diluted EPS, shares, debt and cash for a stock (about 4-5 fiscal years), plus suggested DCF starting assumptions and any saved DCF models.",
      inputSchema: tickerInput,
      run: tracked(ctx, "get_financial_history", (i) => `Pulling ${resolve(i)} annual financials`, async (input) => {
        const symbol = resolve(input);
        await loadSnapshot(symbol);
        const d = await getDcfContext(accountId, symbol);
        const b = (v: number | null) => (v == null ? null : Number((v / 1e9).toFixed(3)));
        return {
          result: {
            symbol,
            unit: `${d.currency ?? "USD"} billions (shares in billions, EPS per share)`,
            currencyNote: d.currencyNote,
            years: d.history.map((h) => ({
              year: h.year,
              freeCashFlow: b(h.freeCashFlow),
              operatingCashFlow: b(h.operatingCashFlow),
              capex: b(h.capitalExpenditure),
              revenue: b(h.revenue),
              netIncome: b(h.netIncome),
              dilutedEps: h.dilutedEps,
              shares: b(h.shares),
              totalDebt: b(h.totalDebt),
              cash: b(h.cash),
            })),
            price: d.price,
            suggestedAssumptions: d.suggested,
            savedModels: d.models.slice(0, 3).map((m) => ({
              name: m.name,
              createdAt: m.createdAt,
              assumptions: m.assumptions,
              intrinsicPerShare: fmt(m.outputs.intrinsicPerShare),
              marginOfSafety: fmt(m.outputs.marginOfSafety),
            })),
          },
          summary: `${d.history.length} fiscal years${d.models.length ? ` · ${d.models.length} saved model(s)` : ""}`,
        };
      }),
    }),

    betaZodTool({
      name: "run_dcf",
      description:
        "Run the two-stage DCF. Any assumption you omit uses the suggested default from history. Percent inputs are in percent (9 = 9%). Set save=true only when the user wants this model kept (it then feeds the margin-of-safety criterion).",
      inputSchema: tickerInput.extend({
        growthRate: z.number().optional().describe("Stage-1 annual FCF growth, percent"),
        highGrowthYears: z.number().int().min(1).max(10).optional(),
        terminalGrowth: z.number().optional().describe("Perpetual growth after year 10, percent"),
        discountRate: z.number().optional().describe("Discount rate / WACC, percent"),
        exitMultiple: z.number().nullable().optional().describe("Use an exit multiple of year-10 FCF instead of Gordon growth"),
        baseFcf: z.number().optional().describe("Starting annual free cash flow in USD (not billions)"),
        save: z.boolean().optional(),
        name: z.string().max(60).optional(),
      }),
      run: tracked(
        ctx,
        "run_dcf",
        (i) => `Running ${resolve(i)} DCF${i.growthRate != null ? ` · ${i.growthRate}% growth` : ""}${i.discountRate != null ? ` · ${i.discountRate}% discount` : ""}`,
        async (input) => {
          const symbol = resolve(input);
          await loadSnapshot(symbol);
          const d = await getDcfContext(accountId, symbol);
          if (!d.suggested) throw new Error(`Not enough financial history to build a ${symbol} DCF.`);
          const { save, name, ...rest } = input;
          const overrides: Partial<DcfAssumptions> = { ...rest };
          delete (overrides as { symbol?: string }).symbol;
          const assumptions: DcfAssumptions = dcfAssumptionsSchema.parse({
            ...d.suggested,
            ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
          });
          const { outputs, grid } = computeDcf(assumptions);
          if (save) await saveDcfModel(accountId, symbol, assumptions, { name: name ?? "Claude model", createdBy: "claude" });
          return {
            result: {
              symbol,
              assumptions: {
                ...assumptions,
                baseFcfBillions: fmt(assumptions.baseFcf / 1e9, 3),
                cashBillions: fmt(assumptions.cash / 1e9, 3),
                debtBillions: fmt(assumptions.debt / 1e9, 3),
              },
              intrinsicPerShare: fmt(outputs.intrinsicPerShare),
              price: assumptions.price,
              marginOfSafetyPct: fmt(outputs.marginOfSafety, 1),
              terminalValueSharePct: fmt(outputs.terminalShare, 1),
              scenarios: { bear: fmt(outputs.scenarios.bear), base: fmt(outputs.scenarios.base), bull: fmt(outputs.scenarios.bull) },
              sensitivity: {
                rows: "discount rate %",
                cols: "terminal growth %",
                discountRates: grid.discountRates,
                terminalGrowths: grid.terminalGrowths,
                intrinsicPerShare: grid.values.map((r) => r.map((v) => fmt(v))),
              },
              warnings: outputs.warnings,
              saved: Boolean(save),
            },
            summary: `Intrinsic $${outputs.intrinsicPerShare.toFixed(2)}${outputs.marginOfSafety != null ? ` · MoS ${outputs.marginOfSafety.toFixed(0)}%` : ""}${save ? " · saved" : ""}`,
          };
        }
      ),
    }),

    betaZodTool({
      name: "compare_peers",
      description:
        "Fetch live fundamentals for up to 5 tickers and score each against the user's criteria, side by side. Doesn't add them to the watchlist.",
      inputSchema: z.object({ symbols: z.array(z.string().min(1).max(10)).min(1).max(5) }),
      run: tracked(ctx, "compare_peers", (i) => `Comparing ${i.symbols.join(", ").toUpperCase()}`, async ({ symbols }) => {
        const rows = await Promise.all(
          symbols.map(async (raw) => {
            const sym = raw.toUpperCase();
            try {
              const s = await fetchYahooFundamentals(sym);
              const values = metricValuesFromSnapshot(s, { fx: await statementFx(s.raw) });
              const e = evaluateCriteria(values, ctx.profile);
              return { symbol: sym, price: s.price, score: e.score, verdict: e.verdict, metrics: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, fmt(v ?? null)])) };
            } catch (err) {
              return { symbol: sym, error: err instanceof Error ? err.message : "lookup failed" };
            }
          })
        );
        return { result: rows, summary: rows.map((r) => `${r.symbol}${"score" in r ? ` ${r.score ?? "–"}` : " n/a"}`).join(" · ") };
      }),
    }),

    betaZodTool({
      name: "list_filings",
      description:
        "The company's last 5 annual reports from SEC EDGAR (10-K, or 20-F for foreign filers): fiscal year, filing date, which sections were found and whether an AI digest exists. Use before reading filings.",
      inputSchema: tickerInput,
      run: tracked(ctx, "list_filings", (i) => `Finding ${resolve(i)} annual reports`, async (input) => {
        const symbol = resolve(input);
        const c = await ensureFilings(symbol);
        return {
          result: {
            symbol,
            company: c.companyName,
            filings: c.filings.map((f) => ({
              form: f.form,
              fiscalYear: f.fiscalYear,
              filed: f.filedAt.toISOString().slice(0, 10),
              sectionsFound: SECTION_KEYS.filter((k) => (f.sections as Partial<Record<SectionKey, string>>)[k]),
              riskFactorCount: (f.riskHeadings as unknown[]).length,
              hasDigest: Boolean(f.digest),
              url: f.url,
            })),
          },
          summary: `${c.filings.length} reports · ${c.filings.map((f) => `${f.form} FY${f.fiscalYear}`).slice(0, 2).join(", ")}…`,
        };
      }),
    }),

    betaZodTool({
      name: "get_filing_digests",
      description:
        "Structured AI digests of the last 5 annual reports (business, segments, competitive advantages, moat evidence, top risks, capital allocation, KPIs, notable changes), newest first. Generates any missing digests (slow the first time, then cached). The best starting point for questions about moat, competitive advantage and risk.",
      inputSchema: tickerInput,
      run: tracked(ctx, "get_filing_digests", (i) => `Reading ${resolve(i)} annual reports`, async (input) => {
        const symbol = resolve(input);
        const c = await ensureFilings(symbol);
        const filings = await ensureDigests(c);
        return {
          result: {
            symbol,
            company: c.companyName,
            digests: filings.map((f) => ({ form: f.form, fiscalYear: f.fiscalYear, filed: f.filedAt.toISOString().slice(0, 10), digest: digestOf(f) })),
          },
          summary: `${filings.length} annual reports summarised`,
        };
      }),
    }),

    betaZodTool({
      name: "read_filing_section",
      description:
        "Read the original text of one section of an annual report, in pages of about 25,000 characters. Sections: business, riskFactors, mdna, marketRisk. Use to verify a claim or quote the filing directly.",
      inputSchema: tickerInput.extend({
        fiscalYear: z.number().int().optional().describe("Defaults to the latest filing"),
        section: z.enum(SECTION_KEYS),
        page: z.number().int().min(1).optional().describe("1-based page; defaults to 1"),
      }),
      run: tracked(
        ctx,
        "read_filing_section",
        (i) => `Reading ${resolve(i)} ${i.fiscalYear ? `FY${i.fiscalYear} ` : ""}${i.section}`,
        async (input) => {
          const symbol = resolve(input);
          const c = await ensureFilings(symbol);
          const f = input.fiscalYear ? c.filings.find((x) => x.fiscalYear === input.fiscalYear) : c.filings[0];
          if (!f) throw new Error(`No ${symbol} annual report for fiscal ${input.fiscalYear}. Available: ${c.filings.map((x) => x.fiscalYear).join(", ")}`);
          const text = (f.sections as Partial<Record<SectionKey, string>>)[input.section];
          if (!text) throw new Error(`The ${input.section} section wasn't found in the FY${f.fiscalYear} ${f.form}.`);
          const PAGE = 25_000;
          const pages = Math.ceil(text.length / PAGE);
          const page = Math.min(input.page ?? 1, pages);
          return {
            result: {
              symbol,
              source: `${f.form} FY${f.fiscalYear} · ${SECTION_LABELS[input.section][f.form as AnnualForm]}`,
              url: f.url,
              page,
              pages,
              text: text.slice((page - 1) * PAGE, page * PAGE),
            },
            summary: `${f.form} FY${f.fiscalYear} · page ${page}/${pages}`,
          };
        }
      ),
    }),

    betaZodTool({
      name: "compare_risk_factors",
      description:
        "Year-over-year changes in the company's risk-factor headings across its last 5 annual reports: risks added, removed and reworded. New risks are often an early warning.",
      inputSchema: tickerInput,
      run: tracked(ctx, "compare_risk_factors", (i) => `Comparing ${resolve(i)} risk factors`, async (input) => {
        const symbol = resolve(input);
        const c = await ensureFilings(symbol);
        const changes = riskChanges(c.filings);
        return {
          result: {
            symbol,
            changes: changes.map((ch) => ({
              fiscalYear: ch.fiscalYear,
              vsYear: ch.vsYear,
              added: ch.diff.added.map((h) => h.title),
              removed: ch.diff.removed.map((h) => h.title),
              reworded: ch.diff.reworded.map((r) => ({ from: r.from, to: r.to })),
              unchanged: ch.diff.unchangedCount,
            })),
          },
          summary: changes.map((ch) => `FY${ch.fiscalYear}: +${ch.diff.added.length}/−${ch.diff.removed.length}`).join(" · ") || "No comparison available",
        };
      }),
    }),

    betaZodTool({
      name: "get_long_term_financials",
      description:
        "About 10 years of annual figures from SEC XBRL: revenue, gross/operating/net margin, net income, EPS, free cash flow, ROE, ROIC, debt, cash, buybacks, dividends, diluted share count, inventory. In the stock's trading currency. Use for consistency and long-run trends.",
      inputSchema: tickerInput,
      run: tracked(ctx, "get_long_term_financials", (i) => `Pulling ${resolve(i)} 10-year financials`, async (input) => {
        const symbol = resolve(input);
        const d = await getCompanyFinancials(accountId, symbol);
        const b = (v?: number) => (v == null ? null : Number((v / 1e9).toFixed(3)));
        const p = (v?: number) => (v == null ? null : Number(v.toFixed(1)));
        return {
          result: {
            symbol,
            unit: `${d.currency} billions (EPS per share; margins, ROE and ROIC in percent; shares in billions)`,
            currencyNote: d.currencyNote,
            years: d.years.map((y) => ({
              fiscalYear: y.fiscalYear,
              revenue: b(y.revenue),
              grossMargin: p(y.grossMargin),
              operatingMargin: p(y.operatingMargin),
              netMargin: p(y.netMargin),
              netIncome: b(y.netIncome),
              dilutedEps: y.dilutedEps ?? null,
              operatingCashFlow: b(y.operatingCashFlow),
              capex: b(y.capex),
              depreciation: b(y.depreciation),
              freeCashFlow: b(y.freeCashFlow),
              roe: p(y.roe),
              roic: p(y.roic),
              totalDebt: b(y.totalDebt),
              cash: b(y.cash),
              buybacks: b(y.buybacks),
              dividends: b(y.dividends),
              dilutedShares: b(y.dilutedShares),
              inventory: b(y.inventory),
            })),
          },
          summary: `${d.years.length} years${d.years.length ? ` · FY${d.years[0].fiscalYear}–FY${d.years[d.years.length - 1].fiscalYear}` : ""}`,
        };
      }),
    }),

    betaZodTool({
      name: "generate_company_report",
      description:
        "Write (or reuse) the full Company Report for a stock under the active lens: two-minute story, competitive advantage, moat rating, greatest risks, management, track record, lens fit, and answers to the lens questions, all cited to the annual reports. Takes 1-2 minutes the first time for a company. The app shows the user a card linking to the full report, so summarise the key findings in your reply instead of repeating the whole report. Reuses a report from the last 7 days unless regenerate=true.",
      inputSchema: tickerInput.extend({ regenerate: z.boolean().optional() }),
      run: tracked(ctx, "generate_company_report", (i) => `Writing the ${ctx.lens?.name ?? "General"} report on ${resolve(i)}`, async (input) => {
        const symbol = resolve(input);
        const lensKey = ctx.lens?.key ?? "none";
        let saved = input.regenerate ? null : await latestReport(accountId, symbol, lensKey);
        if (saved && Date.now() - saved.createdAt.getTime() > 7 * 86_400_000) saved = null;
        if (!saved) {
          const listed = await prisma.fundamentalWatchlistItem.findUnique({
            where: { accountId_symbol: { accountId, symbol } },
            select: { id: true },
          });
          // Record it as a job so the company page shows progress while the chat waits.
          const { job, created } = await createReportJob({ userId: ctx.userId, accountId, symbol, lensKey });
          if (!created) throw new Error(`A ${ctx.lens?.name ?? "General"} report on ${symbol} is already being written. Check the Report tab in a minute.`);
          saved = await runReportJob(job, ctx.userId);
          if (!listed) ctx.emit({ t: "watchlist", symbol });
        }
        const r = saved.report as unknown as CompanyReportBody;
        ctx.emit({
          t: "report",
          symbol,
          lensKey: saved.lensKey,
          lensName: ctx.lens?.name ?? "General",
          verdict: r.lensFit.verdict,
          score: r.lensFit.score,
          moat: r.moat.rating,
          oneLine: r.oneLineVerdict,
          greatestRisk: r.greatestRisks[0]?.risk ?? null,
        });
        return {
          result: { symbol, lens: ctx.lens?.name ?? "General", generatedAt: saved.createdAt.toISOString(), report: r },
          summary: `${r.lensFit.verdict} fit ${r.lensFit.score}/100 · ${r.moat.rating} moat`,
        };
      }),
    }),

    betaZodTool({
      name: "get_insider_and_estimates",
      description:
        "Insider buying/selling over the last 6 months and recent insider trades, insider and institutional ownership, sector/industry, and analyst EPS estimates with 30-day revision counts and 90-day estimate trend.",
      inputSchema: tickerInput,
      run: tracked(ctx, "get_insider_and_estimates", (i) => `Checking ${resolve(i)} insiders and estimates`, async (input) => {
        const symbol = resolve(input);
        const d = await getOwnershipAndMomentum(symbol);
        const n = d.ownership.insiderNet6m;
        return { result: { symbol, ...d }, summary: `Insiders 6m: ${n.buys ?? 0} buys / ${n.sells ?? 0} sells · inst. ${d.ownership.institutionsPercentHeld ?? "?"}%` };
      }),
    }),

    betaZodTool({
      name: "get_price_trend",
      description: "A stock's price versus its 50- and 200-day averages, 3- and 12-month performance, and distance from its 52-week high.",
      inputSchema: tickerInput,
      run: tracked(ctx, "get_price_trend", (i) => `Checking ${resolve(i)} price trend`, async (input) => {
        const symbol = resolve(input);
        const t = await getPriceTrend(symbol);
        return {
          result: { symbol, ...t },
          summary: `${t.aboveSma200 ? "Above" : "Below"} 200-day · 12m ${t.change12mPct ?? "?"}%`,
        };
      }),
    }),

    betaZodTool({
      name: "get_macro_snapshot",
      description:
        "Current macro backdrop: T-bill, 5- and 10-year Treasury yields and the curve, US dollar index, VIX, S&P 500, oil and copper, each with 52-week change and position versus moving averages.",
      inputSchema: z.object({}),
      run: tracked(ctx, "get_macro_snapshot", () => "Checking rates, dollar and markets", async () => {
        const m = await getMacroSnapshot();
        const tnx = m.rows.find((r) => r.symbol === "^TNX")?.value;
        return { result: m, summary: `10y ${tnx ?? "?"}% · curve ${m.curve10yMinus3m ?? "?"}` };
      }),
    }),

    betaZodTool({
      name: "run_screen",
      description: `Screen the whole US market on Finviz Elite. By default uses the active lens's filters. Pass filter codes to customise; valid codes: ${FILTERS.map((f) => `${f.label}: ${f.options.map((o) => o.code).join("|")}`).join("; ")}. Returns up to 25 matches with key metrics.`,
      inputSchema: z.object({
        filters: z.array(z.string()).max(20).optional().describe("Finviz filter codes; omit to use the active lens's screen"),
        sort: z.enum(["-marketcap", "pe", "peg", "-roe", "-epsgrowth5years", "-perf52w"]).optional(),
      }),
      run: tracked(ctx, "run_screen", () => `Screening the market${ctx.lens ? ` (${ctx.lens.name})` : ""}`, async (input) => {
        const filters = input.filters?.length ? input.filters : (ctx.lens?.finvizFilters ?? []);
        if (!filters.length) throw new Error("No filters given and no lens is active. Pass filter codes.");
        const { rows } = await runScreen(await getFinvizToken(ctx.userId), filters, input.sort ?? "-marketcap");
        return {
          result: {
            filters: filters.map((c) => describeFilter(c) ?? { filter: c, option: "unknown code" }),
            total: rows.length,
            top: rows.slice(0, 25),
            note: "marketCap is in USD millions; percent metrics in percent.",
          },
          summary: `${rows.length} matches`,
        };
      }),
    }),

    betaZodTool({
      name: "get_wealthos_score",
      description: `The stock's ${SCORE_NAME} (0-100) under the active lens, with its pillars (quality, growth, strength, valuation, moat & risk, and momentum for some lenses), the evidence behind each, any caps (e.g. failing a must-have rule) and confidence. Calculated in code from 10-year SEC data, live metrics, the user's DCF and the Company Report. Use it to rank or compare stocks and to explain what's driving a score.`,
      inputSchema: tickerInput.extend({ refresh: z.boolean().optional().describe("Recalculate even if a recent score exists") }),
      run: tracked(ctx, "get_wealthos_score", (i) => `Scoring ${resolve(i)}`, async (input) => {
        const symbol = resolve(input);
        await loadSnapshot(symbol);
        const s = await getCompanyScore({ userId: ctx.userId, accountId, symbol, lensKey: ctx.lens?.key ?? null, force: input.refresh });
        return {
          result: { symbol, ...s },
          summary: `${SCORE_NAME} ${s.score ?? "n/a"} · ${s.lensName} · ${s.confidence.toLowerCase()} confidence`,
        };
      }),
    }),

    betaZodTool({
      name: "list_watchlist",
      description:
        "Every stock on the user's research watchlist with price, criteria score and PASS/WATCH/FAIL verdict (using cached fundamentals, with their as-of date), plus any verdict the user saved. Use for screening questions across their list.",
      inputSchema: z.object({}),
      run: tracked(ctx, "list_watchlist", () => "Scanning your watchlist", async () => {
        const [items, snaps, research, models, scores] = await Promise.all([
          prisma.fundamentalWatchlistItem.findMany({ where: { accountId }, select: { symbol: true, yahooFetchStatus: true } }),
          prisma.fundamentalSnapshot.findMany({ where: { accountId } }),
          prisma.fundamentalResearch.findMany({ where: { accountId }, select: { symbol: true, verdict: true } }),
          prisma.dcfModel.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, select: { symbol: true, outputs: true } }),
          prisma.companyScore.findMany({ where: { accountId, lensKey: ctx.lens?.key ?? "none" }, select: { symbol: true, score: true, confidence: true } }),
        ]);
        const scoreBy = new Map(scores.map((x) => [x.symbol, x]));
        const snapBy = new Map(snaps.map((x) => [x.symbol, x]));
        const verdictBy = new Map(research.map((r) => [r.symbol, r.verdict]));
        const mosBy = new Map<string, number>();
        for (const m of models) {
          const mos = (m.outputs as { marginOfSafety?: number | null }).marginOfSafety;
          if (!mosBy.has(m.symbol) && typeof mos === "number") mosBy.set(m.symbol, mos);
        }
        const rows = await Promise.all(
          items.map(async (it) => {
            const snap = snapBy.get(it.symbol) ?? null;
            if (!snap) return { symbol: it.symbol, status: it.yahooFetchStatus.toLowerCase(), score: null, verdict: null };
            const { evaluation: e } = evaluateSnapshot(snap, ctx.profile, mosBy.get(it.symbol) ?? null, await fxForSnapshot(snap));
            return {
              symbol: it.symbol,
              price: snap.price?.toNumber() ?? null,
              asOf: snap.fetchedAt.toISOString().slice(0, 10),
              score: e.score,
              verdict: e.verdict,
              failedRequired: e.failedRequired.map((k) => METRICS[k].name),
              red: e.rows.filter((r) => r.status === "red").map((r) => `${r.name} ${r.formatted}`),
              yourVerdict: verdictBy.get(it.symbol) ?? null,
              wealthosScore: scoreBy.get(it.symbol)?.score ?? null,
            };
          })
        );
        rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        const pass = rows.filter((r) => r.verdict === "PASS").length;
        return {
          result: { passScore: ctx.profile.passScore, count: rows.length, stocks: rows },
          summary: `${rows.length} stocks · ${pass} pass`,
        };
      }),
    }),

    betaZodTool({
      name: "list_my_holdings",
      description:
        "Everything the user holds in this account: each stock's bucket (Core / Speculation / Free Money), shares, adjusted cost, current price and open option count.",
      inputSchema: z.object({}),
      run: tracked(ctx, "list_my_holdings", () => "Listing your holdings", async () => {
        const us = await prisma.underlying.findMany({
          where: { accountId },
          include: {
            wheelClassification: true,
            stockLots: { where: { remaining: { gt: 0 } } },
            _count: { select: { strategyInstances: { where: { status: "OPEN", instrumentType: "OPTION" } } } },
          },
        });
        const rows = us
          .map((u) => {
            const shares = u.stockLots.reduce((s, l) => s + l.remaining.toNumber(), 0);
            const cost = u.stockLots.reduce(
              (s, l) => s + l.costBasis.div(l.quantity).minus(l.premiumReduction.div(l.quantity)).mul(l.remaining).toNumber(),
              0
            );
            return {
              symbol: u.symbol,
              bucket: BUCKET_LABELS[(u.wheelClassification?.category ?? "SPECULATION") as Bucket],
              shares,
              adjustedCostPerShare: shares > 0 ? fmt(cost / shares) : null,
              currentPrice: u.currentPrice?.toNumber() ?? null,
              openOptions: u._count.strategyInstances,
            };
          })
          .filter((r) => r.shares > 0 || r.openOptions > 0)
          .sort((a, b) => a.bucket.localeCompare(b.bucket) || a.symbol.localeCompare(b.symbol));
        return { result: rows, summary: `${rows.length} positions` };
      }),
    }),

    betaZodTool({
      name: "get_my_criteria",
      description: "The user's research criteria: each enabled metric's good/ok thresholds, weight and whether it's required, plus the pass score.",
      inputSchema: z.object({}),
      run: tracked(ctx, "get_my_criteria", () => "Reading your criteria", async () => {
        const criteria = ctx.profile.criteria
          .filter((c) => c.enabled)
          .map((c) => ({ metric: METRICS[c.key].name, rule: ruleText(METRICS[c.key], c), weight: c.weight, required: c.required }));
        return { result: { passScore: ctx.profile.passScore, criteria }, summary: `${criteria.length} rules · pass at ${ctx.profile.passScore}` };
      }),
    }),

    betaZodTool({
      name: "get_my_position",
      description:
        "What the user holds in one stock in this account: bucket (Core / Speculation / Free Money), shares, cost basis, current price, open options, and the core premium plan and bucket balance.",
      inputSchema: tickerInput,
      run: tracked(ctx, "get_my_position", (i) => `Checking your ${resolve(i)} position`, async (input) => {
        const symbol = resolve(input);
        const u = await prisma.underlying.findUnique({
          where: { accountId_symbol: { accountId, symbol } },
          include: {
            wheelClassification: true,
            corePlan: true,
            stockLots: { where: { remaining: { gt: 0 } } },
            premiumBucketEntries: true,
            strategyInstances: {
              where: { status: "OPEN", instrumentType: "OPTION" },
              select: { callPut: true, longShort: true, strike: true, expiration: true, quantity: true, strategyType: true },
            },
          },
        });
        if (!u) return { result: { symbol, held: false }, summary: `${symbol} not held` };
        const shares = u.stockLots.reduce((s, l) => s + l.remaining.toNumber(), 0);
        const cost = u.stockLots.reduce((s, l) => s + l.costBasis.div(l.quantity).minus(l.premiumReduction.div(l.quantity)).mul(l.remaining).toNumber(), 0);
        const bucket = (u.wheelClassification?.category ?? "SPECULATION") as Bucket;
        return {
          result: {
            symbol,
            held: shares > 0 || u.strategyInstances.length > 0,
            bucket: BUCKET_LABELS[bucket],
            shares,
            adjustedCostPerShare: shares > 0 ? fmt(cost / shares) : null,
            currentPrice: u.currentPrice?.toNumber() ?? null,
            openOptions: u.strategyInstances.map((o) => ({
              type: o.strategyType,
              side: o.longShort,
              callPut: o.callPut,
              strike: o.strike?.toNumber(),
              expiration: o.expiration?.toISOString().slice(0, 10),
              contracts: o.quantity.toNumber(),
            })),
            corePlan: u.corePlan ? { mode: u.corePlan.mode, shareGoal: u.corePlan.shareGoal } : null,
            premiumBucketBalance: fmt(u.premiumBucketEntries.reduce((s, e) => s + e.amount.toNumber(), 0)),
          },
          summary: shares > 0 ? `${shares} shares · ${BUCKET_LABELS[bucket]}` : `${u.strategyInstances.length} open option(s)`,
        };
      }),
    }),

    betaZodTool({
      name: "get_research_notes",
      description: "The user's saved research for a stock: verdict, notes, earnings review, management and brand scores.",
      inputSchema: tickerInput,
      run: tracked(ctx, "get_research_notes", (i) => `Reading your ${resolve(i)} notes`, async (input) => {
        const symbol = resolve(input);
        const r = await prisma.fundamentalResearch.findUnique({ where: { accountId_symbol: { accountId, symbol } } });
        if (!r) return { result: { symbol, exists: false }, summary: `No ${symbol} notes yet` };
        return {
          result: {
            verdict: r.verdict,
            notes: r.notes,
            earningsReviewedAt: r.earningsReviewedAt?.toISOString().slice(0, 10) ?? null,
            earningsNotes: r.earningsNotes,
            management: { capitalAllocation: r.mgmtCapitalAllocation, incentives: r.mgmtIncentives, execution: r.mgmtExecution },
            brand: { pricingPower: r.brandPricingPower, loyalty: r.brandLoyalty, trust: r.brandTrust },
          },
          summary: r.verdict ? `Verdict ${r.verdict}` : "Notes loaded",
        };
      }),
    }),

    betaZodTool({
      name: "propose_research_update",
      description:
        "Propose saving a verdict (PASS / WATCH / REJECT) and/or notes to the user's research record. The app shows it for the user to confirm; nothing is saved until they do. Only use when the user asks to record something.",
      inputSchema: tickerInput.extend({
        verdict: z.enum(["PASS", "WATCH", "REJECT"]).optional(),
        notes: z.string().max(4000).optional(),
        reason: z.string().max(400),
      }),
      run: tracked(ctx, "propose_research_update", (i) => `Drafting a ${resolve(i)} research update`, async (input) => {
        ctx.emit({ t: "proposal", symbol: resolve(input), verdict: input.verdict ?? null, notes: input.notes ?? null, reason: input.reason });
        return { result: { status: "shown_to_user_for_confirmation" }, summary: "Waiting for your confirmation" };
      }),
    }),
  ];
}

/**
 * Run one chat turn with tools, streaming events. Returns the final assistant text.
 */
export async function runResearchTurn(
  ctx: Omit<AgentContext, "toolLog">,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string
): Promise<{ text: string; toolLog: ToolEventRecord[] }> {
  const toolLog: ToolEventRecord[] = [];
  const full: AgentContext = { ...ctx, toolLog };
  const client = new Anthropic();
  let text = "";

  const runner = client.beta.messages.toolRunner({
    model: RESEARCH_MODEL,
    max_tokens: 16000,
    max_iterations: 10,
    stream: true,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: RESEARCH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      {
        type: "text",
        text: `${ctx.symbol ? `The user is viewing ${ctx.symbol}.` : "The user is on their research desk (no single stock selected)."} Today is ${new Date().toISOString().slice(0, 10)}.`,
      },
      ...(ctx.lens
        ? [
            {
              type: "text" as const,
              text: `${ctx.lens.prompt}\n\nUnder this lens, evaluate_criteria and list_watchlist score against the ${ctx.lens.name}-style preset, not the user's own criteria. When researching a company, make sure your answer covers:\n${ctx.lens.questions.map((q) => `- ${q}`).join("\n")}`,
              cache_control: { type: "ephemeral" as const },
            },
          ]
        : []),
    ],
    tools: buildTools(full),
    messages: [...history, { role: "user", content: userMessage }],
  });

  for await (const stream of runner) {
    stream.on("text", (delta) => {
      text += delta;
      ctx.emit({ t: "text", d: delta });
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      ctx.emit({ t: "error", message: "Claude declined to answer that. Try rephrasing the question." });
      break;
    }
    // Separate text segments from consecutive tool rounds.
    if (message.stop_reason === "tool_use" && text && !text.endsWith("\n")) {
      text += "\n\n";
      ctx.emit({ t: "text", d: "\n\n" });
    }
  }

  return { text: text.trim(), toolLog };
}
