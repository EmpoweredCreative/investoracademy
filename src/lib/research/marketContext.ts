import YahooFinance from "yahoo-finance2";
import { sma } from "@/lib/marketdata/technicals";

/** Market-side context for lenses: insider/ownership (Lynch), revisions, trend and macro (Druckenmiller). */
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

type Obj = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: number | null, d = 2) => (v == null ? null : Number(v.toFixed(d)));

export interface OwnershipActivity {
  insiderNet6m: { buys: number | null; sells: number | null; netShares: number | null; netPctOfInsiderShares: number | null };
  recentInsiderTrades: { date: string; who: string; relation: string; text: string; shares: number | null; value: number | null }[];
  insidersPercentHeld: number | null;
  institutionsPercentHeld: number | null;
  institutionsCount: number | null;
  sector: string | null;
  industry: string | null;
}

export interface EarningsMomentum {
  periods: {
    period: string;
    growthPct: number | null;
    epsEstimate: number | null;
    estimate90dAgo: number | null;
    revisionsUp30d: number | null;
    revisionsDown30d: number | null;
  }[];
}

export interface PriceTrend {
  price: number | null;
  sma50: number | null;
  sma200: number | null;
  aboveSma50: boolean | null;
  aboveSma200: boolean | null;
  change3mPct: number | null;
  change12mPct: number | null;
  offHighPct: number | null;
}

/** Insider activity, ownership and sector — one Yahoo call. */
export async function getOwnershipAndMomentum(symbol: string): Promise<{ ownership: OwnershipActivity; momentum: EarningsMomentum }> {
  const qs = (await yf.quoteSummary(
    symbol,
    { modules: ["insiderTransactions", "netSharePurchaseActivity", "majorHoldersBreakdown", "earningsTrend", "assetProfile"] },
    { validateResult: false }
  )) as Obj;
  const net = (qs.netSharePurchaseActivity ?? {}) as Obj;
  const holders = (qs.majorHoldersBreakdown ?? {}) as Obj;
  const profile = (qs.assetProfile ?? {}) as Obj;
  const txs = (((qs.insiderTransactions ?? {}) as Obj).transactions ?? []) as Obj[];
  const trend = (((qs.earningsTrend ?? {}) as Obj).trend ?? []) as Obj[];
  const pct = (v: unknown) => round(num(v) == null ? null : (num(v) as number) * 100, 1);

  return {
    ownership: {
      insiderNet6m: {
        buys: num(net.buyInfoCount),
        sells: num(net.sellInfoCount),
        netShares: num(net.netInfoShares),
        netPctOfInsiderShares: pct(net.netPercentInsiderShares),
      },
      recentInsiderTrades: txs.slice(0, 10).map((t) => ({
        date: String(t.startDate ?? "").slice(0, 10),
        who: String(t.filerName ?? ""),
        relation: String(t.filerRelation ?? ""),
        text: String(t.transactionText ?? "") || "Transaction (no description)",
        shares: num(t.shares),
        value: num(t.value),
      })),
      insidersPercentHeld: pct(holders.insidersPercentHeld),
      institutionsPercentHeld: pct(holders.institutionsPercentHeld),
      institutionsCount: num(holders.institutionsCount),
      sector: (profile.sector as string) ?? null,
      industry: (profile.industry as string) ?? null,
    },
    momentum: {
      periods: trend
        .filter((t) => ["0q", "+1q", "0y", "+1y"].includes(String(t.period)))
        .map((t) => {
          const est = (t.earningsEstimate ?? {}) as Obj;
          const rev = (t.epsRevisions ?? {}) as Obj;
          const tr = (t.epsTrend ?? {}) as Obj;
          return {
            period: String(t.period),
            growthPct: pct(t.growth),
            epsEstimate: round(num(est.avg)),
            estimate90dAgo: round(num(tr["90daysAgo"])),
            revisionsUp30d: num(rev.upLast30days),
            revisionsDown30d: num(rev.downLast30days),
          };
        }),
    },
  };
}

/** 50/200-day trend and 3/12-month performance from daily closes. */
export async function getPriceTrend(symbol: string): Promise<PriceTrend> {
  const chart = (await yf.chart(
    symbol,
    { period1: new Date(Date.now() - 400 * 86_400_000), interval: "1d" },
    { validateResult: false }
  )) as { quotes?: { close?: number | null }[] };
  const closes = (chart.quotes ?? []).map((q) => q.close).filter((c): c is number => typeof c === "number");
  const last = closes.at(-1) ?? null;
  const ago = (n: number) => (closes.length > n ? closes[closes.length - 1 - n] : null);
  const change = (from: number | null) => (last != null && from ? round(((last - from) / from) * 100, 1) : null);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const high = closes.length ? Math.max(...closes.slice(-252)) : null;
  return {
    price: round(last),
    sma50: round(sma50),
    sma200: round(sma200),
    aboveSma50: last != null && sma50 != null ? last > sma50 : null,
    aboveSma200: last != null && sma200 != null ? last > sma200 : null,
    change3mPct: change(ago(63)),
    change12mPct: change(ago(252)),
    offHighPct: last != null && high ? round(((last - high) / high) * 100, 1) : null,
  };
}

const MACRO = [
  { symbol: "^IRX", name: "13-week T-bill yield (%)" },
  { symbol: "^FVX", name: "5-year Treasury yield (%)" },
  { symbol: "^TNX", name: "10-year Treasury yield (%)" },
  { symbol: "DX-Y.NYB", name: "US dollar index" },
  { symbol: "^VIX", name: "VIX volatility" },
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "CL=F", name: "WTI crude oil" },
  { symbol: "HG=F", name: "Copper" },
] as const;

let macroCache: { at: number; value: Awaited<ReturnType<typeof fetchMacro>> } | null = null;

async function fetchMacro() {
  const quotes = (await yf.quote(MACRO.map((m) => m.symbol), {}, { validateResult: false })) as Obj[];
  const by = new Map(quotes.map((q) => [String(q.symbol), q]));
  const rows = MACRO.map((m) => {
    const q = by.get(m.symbol) ?? {};
    const price = num(q.regularMarketPrice);
    const d50 = num(q.fiftyDayAverage);
    const d200 = num(q.twoHundredDayAverage);
    return {
      name: m.name,
      symbol: m.symbol,
      value: round(price, 3),
      change52wPct: round(num(q.fiftyTwoWeekChangePercent), 1),
      vs50dAvg: price != null && d50 ? round(((price - d50) / d50) * 100, 1) : null,
      vs200dAvg: price != null && d200 ? round(((price - d200) / d200) * 100, 1) : null,
    };
  });
  const tnx = rows.find((r) => r.symbol === "^TNX")?.value ?? null;
  const irx = rows.find((r) => r.symbol === "^IRX")?.value ?? null;
  return {
    asOf: new Date().toISOString(),
    rows,
    curve10yMinus3m: tnx != null && irx != null ? round(tnx - irx, 2) : null,
    note: "Yields in percent. vs50dAvg/vs200dAvg: % above (+) or below (−) the moving average.",
  };
}

/** Rates, dollar, volatility, equities and commodities — cached for 15 minutes. */
export async function getMacroSnapshot() {
  if (macroCache && Date.now() - macroCache.at < 15 * 60_000) return macroCache.value;
  const value = await fetchMacro();
  macroCache = { at: Date.now(), value };
  return value;
}
