import YahooFinance from "yahoo-finance2";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { snapshotCurrencies, statementFx } from "@/lib/marketdata/fx";
import type { AnnualFinancials } from "./dcf";

const client = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
const HISTORY_TTL_MS = 7 * 24 * 3600_000;
const MODULES = ["cash-flow", "financials", "balance-sheet"] as const;

type Row = Record<string, unknown> & { date?: unknown };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Annual statements (≈4–5 fiscal years) merged by fiscal year, oldest first. */
export async function fetchAnnualFinancials(symbol: string): Promise<AnnualFinancials[]> {
  const byYear = new Map<number, Row>();
  const period1 = new Date(Date.now() - 7 * 365 * 24 * 3600_000);

  for (const statement of MODULES) {
    // Yahoo's schema drifts; skip validation and read only the fields we need.
    const rows = (await client.fundamentalsTimeSeries(
      symbol,
      { period1, type: "annual", module: statement },
      { validateResult: false }
    )) as Row[];
    for (const row of rows) {
      const d = row.date instanceof Date ? row.date : typeof row.date === "string" ? new Date(row.date) : typeof row.date === "number" ? new Date(row.date * 1000) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      const year = d.getUTCFullYear();
      byYear.set(year, { ...(byYear.get(year) ?? {}), ...row });
    }
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, r]) => ({
      year,
      freeCashFlow: num(r.freeCashFlow),
      operatingCashFlow: num(r.operatingCashFlow),
      capitalExpenditure: num(r.capitalExpenditure),
      revenue: num(r.totalRevenue),
      netIncome: num(r.netIncome),
      dilutedEps: num(r.dilutedEPS),
      shares: num(r.dilutedAverageShares) ?? num(r.ordinarySharesNumber),
      totalDebt: num(r.totalDebt),
      cash: num(r.cashCashEquivalentsAndShortTermInvestments) ?? num(r.cashAndCashEquivalents),
    }))
    .filter((y) => y.freeCashFlow != null || y.revenue != null);
}

const MONEY_FIELDS = [
  "freeCashFlow",
  "operatingCashFlow",
  "capitalExpenditure",
  "revenue",
  "netIncome",
  "dilutedEps",
  "totalDebt",
  "cash",
] as const;

/** Convert statement-currency amounts into the trading currency (shares are unitless). */
function convertHistory(history: AnnualFinancials[], fx: number): AnnualFinancials[] {
  if (fx === 1) return history;
  return history.map((y) => {
    const out = { ...y };
    for (const k of MONEY_FIELDS) out[k] = y[k] == null ? null : (y[k] as number) * fx;
    return out;
  });
}

export interface FinancialHistoryResult {
  history: AnnualFinancials[];
  price: number | null;
  /** Currency of `history` amounts and `price`. */
  currency: string | null;
  /** Set when statements were converted (e.g. "Converted from CNY at 0.1492"). */
  currencyNote: string | null;
}

/**
 * Annual history in the trading currency. Raw statements are cached on the
 * FundamentalSnapshot (refreshed weekly); FX conversion is applied on read.
 */
export async function getFinancialHistory(
  accountId: string,
  symbol: string,
  opts: { force?: boolean } = {}
): Promise<FinancialHistoryResult> {
  const snapshot = await prisma.fundamentalSnapshot.findUnique({
    where: { accountId_symbol: { accountId, symbol } },
    select: { id: true, financialHistory: true, historyFetchedAt: true, price: true, raw: true },
  });
  const fresh =
    snapshot?.historyFetchedAt && Date.now() - snapshot.historyFetchedAt.getTime() < HISTORY_TTL_MS && snapshot.financialHistory;

  let history: AnnualFinancials[];
  if (fresh && !opts.force) {
    history = snapshot!.financialHistory as unknown as AnnualFinancials[];
  } else {
    history = await fetchAnnualFinancials(symbol);
    if (snapshot) {
      await prisma.fundamentalSnapshot.update({
        where: { id: snapshot.id },
        data: { financialHistory: history as unknown as Prisma.InputJsonValue, historyFetchedAt: new Date() },
      });
    }
  }

  const { financial, quote } = snapshotCurrencies(snapshot?.raw);
  const fx = await statementFx(snapshot?.raw);
  if (fx == null) {
    throw new Error(`${symbol} reports in ${financial} but trades in ${quote}, and no exchange rate is available right now.`);
  }
  return {
    history: convertHistory(history, fx),
    price: snapshot?.price?.toNumber() ?? null,
    currency: quote ?? financial,
    currencyNote: fx !== 1 ? `Statements converted from ${financial} to ${quote} at ${fx.toFixed(4)}` : null,
  };
}
