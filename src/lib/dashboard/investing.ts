/**
 * Investing year: monthly investment cash flow by source, shares added, and a
 * projection for the rest of the year. Pure functions on plain data.
 */

export const CASH_SOURCES = [
  "COVERED_CALLS",
  "CASH_SECURED_PUTS",
  "CREDIT_SPREADS",
  "CONDORS_STRANGLES",
  "OTHER_OPTIONS",
  "DIVIDENDS",
] as const;
export type CashSource = (typeof CASH_SOURCES)[number];

export const SOURCE_LABEL: Record<CashSource, string> = {
  COVERED_CALLS: "Covered calls",
  CASH_SECURED_PUTS: "Cash-secured puts",
  CREDIT_SPREADS: "Credit spreads",
  CONDORS_STRANGLES: "Iron condors & strangles",
  OTHER_OPTIONS: "Other options",
  DIVIDENDS: "Dividends & interest",
};

/** Which cash-flow source an option strategy belongs to. */
export function sourceFor(strategyType: string | null | undefined): Exclude<CashSource, "DIVIDENDS"> {
  switch (strategyType) {
    case "COVERED_CALL":
      return "COVERED_CALLS";
    case "SHORT_PUT":
      return "CASH_SECURED_PUTS";
    case "BULL_PUT_SPREAD":
    case "BEAR_CALL_SPREAD":
      return "CREDIT_SPREADS";
    case "IRON_CONDOR":
    case "IRON_BUTTERFLY":
    case "SHORT_STRANGLE":
      return "CONDORS_STRANGLES";
    default:
      return "OTHER_OPTIONS";
  }
}

export interface LedgerRow {
  accountId: string;
  type: string; // LedgerType
  amount: number; // as stored: positive for typed debits/credits, signed for deposits, dividends, interest
  occurredAt: string; // ISO
  strategyType: string | null;
  description: string | null;
}

export interface LotRow {
  accountId: string;
  symbol: string;
  acquiredAt: string; // ISO
  quantity: number;
  costBasis: number;
  fundedBy: "CASH" | "PREMIUM" | "MIXED";
  premiumFundedQty: number;
}

export interface DividendHolding {
  symbol: string;
  shares: number;
  /** Forward annual dividend per share, if known. */
  annualDividend: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (iso: string) => iso.slice(0, 7);
const zeroSources = () => Object.fromEntries(CASH_SOURCES.map((s) => [s, 0])) as Record<CashSource, number>;

function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/**
 * A lot is a real purchase only if the ledger has a matching stock buy (same
 * account, mentions the symbol, within 2 days). Lots created when a broker sync
 * first reconciles existing positions have no buy, so they don't count as "added".
 */
export function isPurchasedLot(lot: LotRow, ledger: LedgerRow[]): boolean {
  const t = Date.parse(lot.acquiredAt);
  const sym = lot.symbol.toUpperCase();
  return ledger.some(
    (e) =>
      e.type === "STOCK_BUY" &&
      e.accountId === lot.accountId &&
      Math.abs(Date.parse(e.occurredAt) - t) <= 2 * 86_400_000 &&
      (e.description ?? "").toUpperCase().includes(sym)
  );
}

/** Share of a lot's cost paid for with option premium. */
export function premiumShare(lot: LotRow): number {
  if (lot.fundedBy === "CASH") return 0;
  if (lot.fundedBy === "PREMIUM" && lot.premiumFundedQty <= 0) return 1;
  return lot.quantity > 0 ? Math.min(1, lot.premiumFundedQty / lot.quantity) : 0;
}

export interface MonthData {
  month: string; // YYYY-MM
  projected: boolean;
  /** The current month: actual so far. */
  toDate: boolean;
  bySource: Record<CashSource, number>;
  total: number;
  deposits: number;
  stockBought: number;
  stockSold: number;
  fees: number;
  shares: { cost: number; premiumCost: number; cashCost: number; symbols: { symbol: string; shares: number }[] };
}

/**
 * Monthly investment cash flow for `year` plus a projection for the months
 * still ahead. Options project at each source's average over the last 3
 * complete months; dividends project from holdings × forward dividend (or the
 * same 3-month average when no rates are known).
 */
export function investingYear(input: { year: number; today: string; ledger: LedgerRow[]; lots: LotRow[]; dividendHoldings: DividendHolding[] }) {
  const current = input.today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => `${input.year}-${String(i + 1).padStart(2, "0")}`);

  // Actuals for every month that has data (including the 3 months before the year, for the run-rate).
  const actual = new Map<string, Omit<MonthData, "projected" | "toDate">>();
  const get = (m: string) => {
    if (!actual.has(m)) {
      actual.set(m, {
        month: m,
        bySource: zeroSources(),
        total: 0,
        deposits: 0,
        stockBought: 0,
        stockSold: 0,
        fees: 0,
        shares: { cost: 0, premiumCost: 0, cashCost: 0, symbols: [] },
      });
    }
    return actual.get(m)!;
  };

  for (const e of input.ledger) {
    const m = get(monthOf(e.occurredAt));
    switch (e.type) {
      case "PREMIUM_CREDIT":
        m.bySource[sourceFor(e.strategyType)] += e.amount;
        break;
      case "PREMIUM_DEBIT":
        m.bySource[sourceFor(e.strategyType)] -= e.amount;
        break;
      case "DIVIDEND":
      case "INTEREST":
        m.bySource.DIVIDENDS += e.amount;
        break;
      case "CASH_DEPOSIT":
        m.deposits += e.amount;
        break;
      case "STOCK_BUY":
        m.stockBought += e.amount;
        break;
      case "STOCK_SELL":
        m.stockSold += e.amount;
        break;
      case "FEE":
        m.fees += e.amount;
        break;
    }
  }

  for (const lot of input.lots) {
    if (!isPurchasedLot(lot, input.ledger)) continue;
    const m = get(monthOf(lot.acquiredAt));
    const premium = lot.costBasis * premiumShare(lot);
    m.shares.cost += lot.costBasis;
    m.shares.premiumCost += premium;
    m.shares.cashCost += lot.costBasis - premium;
    const existing = m.shares.symbols.find((s) => s.symbol === lot.symbol);
    if (existing) existing.shares += lot.quantity;
    else m.shares.symbols.push({ symbol: lot.symbol, shares: lot.quantity });
  }

  // Run-rate: average of the last 3 complete months.
  const lastThree = [1, 2, 3].map((n) => shiftMonth(current, -n));
  const runRate = zeroSources();
  for (const s of CASH_SOURCES) runRate[s] = round2(lastThree.reduce((sum, m) => sum + (actual.get(m)?.bySource[s] ?? 0), 0) / 3);
  const fromHoldings = input.dividendHoldings.reduce((sum, h) => sum + (h.annualDividend != null ? h.shares * h.annualDividend : 0), 0) / 12;
  const dividendBasis: "holdings" | "average" = fromHoldings > 0 ? "holdings" : "average";
  if (fromHoldings > 0) runRate.DIVIDENDS = round2(fromHoldings);

  const data: MonthData[] = months.map((m) => {
    const projected = m > current;
    const base = projected ? null : actual.get(m);
    const bySource = projected ? { ...runRate } : Object.fromEntries(CASH_SOURCES.map((s) => [s, round2(base?.bySource[s] ?? 0)])) as Record<CashSource, number>;
    const total = round2(CASH_SOURCES.reduce((sum, s) => sum + bySource[s], 0));
    return {
      month: m,
      projected,
      toDate: m === current,
      bySource,
      total,
      deposits: round2(base?.deposits ?? 0),
      stockBought: round2(base?.stockBought ?? 0),
      stockSold: round2(base?.stockSold ?? 0),
      fees: round2(base?.fees ?? 0),
      shares: base
        ? {
            cost: round2(base.shares.cost),
            premiumCost: round2(base.shares.premiumCost),
            cashCost: round2(base.shares.cashCost),
            symbols: base.shares.symbols.sort((a, b) => b.shares - a.shares),
          }
        : { cost: 0, premiumCost: 0, cashCost: 0, symbols: [] },
    };
  });

  const ytd = round2(data.filter((d) => !d.projected).reduce((s, d) => s + d.total, 0));
  const projectedRest = round2(data.filter((d) => d.projected).reduce((s, d) => s + d.total, 0));
  const sharesCost = round2(data.reduce((s, d) => s + d.shares.cost, 0));
  const sharesPremium = round2(data.reduce((s, d) => s + d.shares.premiumCost, 0));
  const ytdBySource = zeroSources();
  for (const d of data.filter((x) => !x.projected)) for (const s of CASH_SOURCES) ytdBySource[s] = round2(ytdBySource[s] + d.bySource[s]);

  return {
    year: input.year,
    months: data,
    ytd,
    projectedYear: round2(ytd + projectedRest),
    ytdBySource,
    runRate,
    dividendBasis,
    shares: { cost: sharesCost, premiumCost: sharesPremium, premiumPct: sharesCost > 0 ? sharesPremium / sharesCost : null },
  };
}

export type InvestingYear = ReturnType<typeof investingYear>;
