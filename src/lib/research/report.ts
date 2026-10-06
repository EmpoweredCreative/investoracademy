import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ANALYST_NAME } from "@/lib/brand";
import { evaluateCriteria, metricValuesFromSnapshot, METRICS } from "@/lib/fundamentals/criteria";
import { refreshSymbolFundamentals } from "@/lib/fundamentals/yahooFundamentals";
import { statementFx } from "@/lib/marketdata/fx";
import { digestOf, ensureDigests, ensureFilings, riskChanges } from "@/lib/sec/filings";
import { MOAT_TYPES } from "@/lib/sec/digest";
import type { SectionKey } from "@/lib/sec/sections";
import { getCompanyFinancials } from "./company";
import { getMacroSnapshot, getOwnershipAndMomentum, getPriceTrend } from "./marketContext";
import { resolveLens } from "./strategies";

export const REPORT_MODEL = "claude-opus-5-5";

const sourceSchema = z
  .object({
    form: z.string().describe("10-K, 20-F, 'XBRL financials' or 'Market data'"),
    fiscalYear: z.number().int().nullable(),
    section: z.enum(["business", "riskFactors", "mdna", "marketRisk", "financials", "market_data"]),
  })
  .nullable()
  .describe("Where the evidence comes from; null only if it is your own inference.");

const point = z.object({ point: z.string(), source: sourceSchema });

export const companyReportSchema = z.object({
  oneLineVerdict: z.string().describe("One sentence: the bottom line under this lens."),
  twoMinuteStory: z.string().describe("What the company does, how it makes money and why it might grow, in plain English (4-6 sentences)."),
  competitiveAdvantage: z.object({ summary: z.string(), points: z.array(point) }),
  moat: z.object({
    rating: z.enum(["NONE", "NARROW", "WIDE"]),
    types: z.array(z.enum(MOAT_TYPES)),
    durability: z.string().describe("How long it should last and what could erode it."),
    evidence: z.array(point),
  }),
  greatestRisks: z
    .array(
      z.object({
        risk: z.string(),
        whyItMatters: z.string(),
        severity: z.enum(["high", "medium", "low"]),
        trend: z.enum(["new", "rising", "stable", "fading", "unclear"]).describe("Based on how the risk evolved across the annual reports."),
        source: sourceSchema,
      })
    )
    .describe("Most severe first; the first item is the single greatest risk."),
  management: z.object({ assessment: z.string(), capitalAllocation: z.string(), points: z.array(point) }),
  financialTrackRecord: z.object({ summary: z.string(), highlights: z.array(z.string()) }),
  lensFit: z.object({
    verdict: z.enum(["STRONG", "PARTIAL", "POOR"]),
    score: z.number().int().min(0).max(100),
    reasoning: z.string(),
    notes: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .describe("Lens-specific call-outs, e.g. Lynch category, owner earnings, macro set-up, catalyst."),
  }),
  customAnswers: z.array(z.object({ question: z.string(), answer: z.string() })).describe("Answers to the strategy's own research questions, if any."),
  whatWouldChangeThePicture: z.array(z.string()),
  questionsToInvestigate: z.array(z.string()),
});
export type CompanyReportBody = z.infer<typeof companyReportSchema>;

export interface ReportSource {
  form: string;
  fiscalYear: number;
  filed: string;
  url: string;
}

const clip = (s: string | undefined, n: number) => (!s ? "(not found)" : s.length > n ? `${s.slice(0, n)}\n[…truncated]` : s);
const SNAPSHOT_MAX_AGE_MS = 24 * 3600_000;

export async function freshSnapshot(accountId: string, symbol: string) {
  const where = { accountId_symbol: { accountId, symbol } };
  let snap = await prisma.fundamentalSnapshot.findUnique({ where });
  if (!snap || Date.now() - snap.fetchedAt.getTime() > SNAPSHOT_MAX_AGE_MS) {
    try {
      await refreshSymbolFundamentals(accountId, symbol);
      snap = await prisma.fundamentalSnapshot.findUnique({ where });
    } catch {
      // Use whatever we have; the report states the as-of date.
    }
  }
  return snap;
}

const settle = async <T>(p: Promise<T>): Promise<T | { unavailable: string }> => {
  try {
    return await p;
  } catch (err) {
    return { unavailable: err instanceof Error ? err.message : "lookup failed" };
  }
};

/**
 * Generate (and save) a Company Report for one stock under one lens.
 * `onStage` reports progress for the UI; the first run for a company also
 * downloads and summarises its annual reports, which are cached afterwards.
 */
export async function generateCompanyReport(opts: {
  userId: string;
  accountId: string;
  symbol: string;
  lensKey: string | null;
  onStage?: (label: string) => void;
}) {
  const { userId, accountId, symbol } = opts;
  const stage = opts.onStage ?? (() => {});
  const lens = await resolveLens(userId, opts.lensKey);

  stage("Finding the last 5 annual reports on SEC EDGAR");
  const company = await ensureFilings(symbol);
  if (!company.filings.length) throw new Error(`No annual reports found for ${symbol}.`);

  const pendingDigests = company.filings.filter((f) => !f.digest).length;
  stage(pendingDigests ? `Reading ${pendingDigests} annual report${pendingDigests > 1 ? "s" : ""} (first time only)` : "Loading annual report summaries");
  const filings = await ensureDigests(company);
  const latest = filings[0];
  const latestSections = latest.sections as Partial<Record<SectionKey, string>>;

  stage("Pulling 10-year financials, live metrics and market data");
  const [financials, snapshot, ownership, trend, macro] = await Promise.all([
    settle(getCompanyFinancials(accountId, symbol)),
    freshSnapshot(accountId, symbol),
    lens.key === "lynch" || lens.key === "druckenmiller" || lens.key.startsWith("strategy:")
      ? settle(getOwnershipAndMomentum(symbol))
      : Promise.resolve(null),
    lens.key === "druckenmiller" ? settle(getPriceTrend(symbol)) : Promise.resolve(null),
    lens.key === "druckenmiller" ? settle(getMacroSnapshot()) : Promise.resolve(null),
  ]);

  let criteria: unknown = "No live fundamentals available.";
  if (snapshot) {
    const fx = await statementFx(snapshot.raw);
    const e = evaluateCriteria(metricValuesFromSnapshot(snapshot, { fx }), lens.criteria);
    criteria = {
      asOf: snapshot.fetchedAt.toISOString().slice(0, 10),
      price: snapshot.price?.toNumber() ?? null,
      score: e.score,
      passScore: e.passScore,
      verdict: e.verdict,
      failedRequired: e.failedRequired.map((k) => METRICS[k].name),
      rows: e.rows.map((r) => ({ metric: r.name, value: r.formatted, status: r.status, rule: r.rule })),
    };
  }

  const b = (v?: number) => (v == null ? null : Number((v / 1e9).toFixed(3)));
  const p = (v?: number) => (v == null ? null : Number(v.toFixed(1)));
  const financialTable =
    "unavailable" in financials
      ? financials
      : {
          unit: `${financials.currency} billions; margins/ROE/ROIC in %`,
          note: financials.currencyNote,
          years: financials.years.map((y) => ({
            fy: y.fiscalYear,
            revenue: b(y.revenue),
            grossMargin: p(y.grossMargin),
            opMargin: p(y.operatingMargin),
            netIncome: b(y.netIncome),
            eps: y.dilutedEps ?? null,
            operatingCashFlow: b(y.operatingCashFlow),
            capex: b(y.capex),
            depreciation: b(y.depreciation),
            fcf: b(y.freeCashFlow),
            roe: p(y.roe),
            roic: p(y.roic),
            debt: b(y.totalDebt),
            cash: b(y.cash),
            buybacks: b(y.buybacks),
            dividends: b(y.dividends),
            shares: b(y.dilutedShares),
            inventory: b(y.inventory),
          })),
        };

  // Stable company dossier first (cacheable across lenses), then the lens-specific ask.
  const dossier = `<company>${company.companyName} (${symbol}), SEC CIK ${company.cik}</company>

<annual_report_digests>
${JSON.stringify(
  filings.map((f) => ({ form: f.form, fiscalYear: f.fiscalYear, filed: f.filedAt.toISOString().slice(0, 10), digest: digestOf(f) })),
  null,
  1
)}
</annual_report_digests>

<risk_factor_changes>
${JSON.stringify(
  riskChanges(filings).map((c) => ({
    fiscalYear: c.fiscalYear,
    vsYear: c.vsYear,
    added: c.diff.added.map((h) => h.title),
    removed: c.diff.removed.map((h) => h.title),
    reworded: c.diff.reworded.map((r) => r.to),
  })),
  null,
  1
)}
</risk_factor_changes>

<latest_${latest.form}_FY${latest.fiscalYear}_business>
${clip(latestSections.business, 40_000)}
</latest_${latest.form}_FY${latest.fiscalYear}_business>

<latest_${latest.form}_FY${latest.fiscalYear}_risk_factors>
${clip(latestSections.riskFactors, 50_000)}
</latest_${latest.form}_FY${latest.fiscalYear}_risk_factors>

<long_term_financials source="SEC XBRL">
${JSON.stringify(financialTable, null, 1)}
</long_term_financials>`;

  const lensContext = {
    criteriaEvaluation: criteria,
    ...(ownership ? { insiderOwnershipAndEstimateRevisions: ownership } : {}),
    ...(trend ? { priceTrend: trend } : {}),
    ...(macro ? { macroSnapshot: macro } : {}),
  };

  const ask = `${lens.prompt}

<lens_data>
${JSON.stringify(lensContext, null, 1)}
</lens_data>

Write the Company Report for ${symbol} under the ${lens.name} lens. Answer every one of these questions somewhere in the report:
${lens.questions.map((q) => `- ${q}`).join("\n")}

Rules:
- Ground every claim in the material above and cite it with \`source\` (form, fiscal year, section). Use section "financials" for the XBRL table and "market_data" for lens data. Never invent numbers.
- Be specific to this company; skip boilerplate risks that apply to every business.
- The moat rating should be earned: WIDE only with strong, durable evidence.
- greatestRisks[0] is the single greatest risk. Use the risk-factor changes to set each risk's trend.
- lensFit.score is how well the company fits this lens (0-100), not a price target. This is education, not a recommendation to buy or sell.
- Fill customAnswers only for the strategy's own questions beyond the standard ones; otherwise leave it empty.`;

  stage(`Writing the ${lens.name} report`);
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: REPORT_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(companyReportSchema) },
    system: `You are the ${ANALYST_NAME}, an equity research analyst. You write rigorous, plain-English company reports from primary sources (annual reports filed with the SEC) and financial data.`,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: dossier, cache_control: { type: "ephemeral" } },
          { type: "text", text: ask },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("The report couldn't be generated. Try again.");
  }

  const sources: ReportSource[] = filings.map((f) => ({
    form: f.form,
    fiscalYear: f.fiscalYear,
    filed: f.filedAt.toISOString().slice(0, 10),
    url: f.url,
  }));
  return prisma.companyReport.create({
    data: {
      accountId,
      symbol,
      lensKey: lens.key,
      report: response.parsed_output as unknown as Prisma.InputJsonValue,
      sources: { companyName: company.companyName, filings: sources, lensName: lens.name } as unknown as Prisma.InputJsonValue,
      model: REPORT_MODEL,
    },
  });
}

export async function latestReport(accountId: string, symbol: string, lensKey: string) {
  return prisma.companyReport.findFirst({ where: { accountId, symbol, lensKey }, orderBy: { createdAt: "desc" } });
}
