import { z } from "zod";

/**
 * Two-stage discounted free cash flow model (pure functions, shared by the UI sliders,
 * the API and Claude's run_dcf tool so every number matches).
 *
 *   Years 1–N1:   FCF grows at `growthRate`
 *   Years N1+1–10: growth fades linearly to `terminalGrowth`
 *   Terminal:     Gordon growth on year-10 FCF (or exit multiple of year-10 FCF)
 *   Equity value = PV(FCF) + PV(terminal) + cash − debt
 */
export const dcfAssumptionsSchema = z.object({
  /** Starting annual free cash flow (USD). */
  baseFcf: z.number(),
  /** Stage-1 annual growth, percent. */
  growthRate: z.number().min(-50).max(100),
  /** Years of stage-1 growth before fading. */
  highGrowthYears: z.number().int().min(1).max(10).default(5),
  /** Long-run growth after year 10, percent. Must be below the discount rate. */
  terminalGrowth: z.number().min(-5).max(6),
  /** Discount rate / WACC, percent. */
  discountRate: z.number().min(3).max(25),
  /** Optional exit multiple on year-10 FCF instead of Gordon growth. */
  exitMultiple: z.number().min(1).max(80).nullable().default(null),
  cash: z.number().default(0),
  debt: z.number().default(0),
  sharesOutstanding: z.number().positive(),
  /** Current share price, for margin of safety. */
  price: z.number().nullable().default(null),
});
export type DcfAssumptions = z.infer<typeof dcfAssumptionsSchema>;

export interface DcfYear {
  year: number;
  growth: number;
  fcf: number;
  discountFactor: number;
  presentValue: number;
}

export interface DcfResult {
  years: DcfYear[];
  pvFcf: number;
  terminalValue: number;
  pvTerminal: number;
  enterpriseValue: number;
  equityValue: number;
  intrinsicPerShare: number;
  /** (intrinsic − price) / intrinsic, percent. Null when price unknown. */
  marginOfSafety: number | null;
  /** Share of value that comes from the terminal value, percent. */
  terminalShare: number;
  warnings: string[];
}

const PROJECTION_YEARS = 10;

export function runDcf(input: DcfAssumptions): DcfResult {
  const a = dcfAssumptionsSchema.parse(input);
  const r = a.discountRate / 100;
  const g1 = a.growthRate / 100;
  const gT = a.terminalGrowth / 100;
  const warnings: string[] = [];

  if (a.exitMultiple == null && gT >= r) {
    throw new Error("Terminal growth must be below the discount rate.");
  }
  if (a.baseFcf <= 0) warnings.push("Starting free cash flow is zero or negative; a DCF is not meaningful.");
  if (a.growthRate > 25) warnings.push("Stage-1 growth above 25% a year is aggressive for most businesses.");
  if (a.terminalGrowth > 3.5) warnings.push("Terminal growth above ~3.5% implies outgrowing the economy forever.");

  const years: DcfYear[] = [];
  let fcf = a.baseFcf;
  let pvFcf = 0;
  for (let t = 1; t <= PROJECTION_YEARS; t++) {
    const growth =
      t <= a.highGrowthYears
        ? g1
        : g1 + ((gT - g1) * (t - a.highGrowthYears)) / (PROJECTION_YEARS - a.highGrowthYears);
    fcf *= 1 + growth;
    const discountFactor = 1 / Math.pow(1 + r, t);
    const presentValue = fcf * discountFactor;
    pvFcf += presentValue;
    years.push({ year: t, growth: growth * 100, fcf, discountFactor, presentValue });
  }

  const last = years[years.length - 1];
  const terminalValue = a.exitMultiple != null ? last.fcf * a.exitMultiple : (last.fcf * (1 + gT)) / (r - gT);
  const pvTerminal = terminalValue * last.discountFactor;
  const enterpriseValue = pvFcf + pvTerminal;
  const equityValue = enterpriseValue + a.cash - a.debt;
  const intrinsicPerShare = equityValue / a.sharesOutstanding;
  const marginOfSafety =
    a.price != null && intrinsicPerShare > 0 ? ((intrinsicPerShare - a.price) / intrinsicPerShare) * 100 : null;
  const terminalShare = enterpriseValue > 0 ? (pvTerminal / enterpriseValue) * 100 : 0;
  if (terminalShare > 75) warnings.push(`${terminalShare.toFixed(0)}% of value comes from the terminal value; results are very sensitive to it.`);

  return { years, pvFcf, terminalValue, pvTerminal, enterpriseValue, equityValue, intrinsicPerShare, marginOfSafety, terminalShare, warnings };
}

/** Intrinsic value per share across discount-rate × terminal-growth combinations. */
export function sensitivityGrid(
  a: DcfAssumptions,
  discountRates: number[] = [a.discountRate - 2, a.discountRate - 1, a.discountRate, a.discountRate + 1, a.discountRate + 2],
  terminalGrowths: number[] = [a.terminalGrowth - 1, a.terminalGrowth - 0.5, a.terminalGrowth, a.terminalGrowth + 0.5, a.terminalGrowth + 1]
) {
  return {
    discountRates,
    terminalGrowths,
    values: discountRates.map((dr) =>
      terminalGrowths.map((tg) => {
        if (a.exitMultiple == null && tg >= dr) return null;
        try {
          return runDcf({ ...a, discountRate: dr, terminalGrowth: tg }).intrinsicPerShare;
        } catch {
          return null;
        }
      })
    ),
  };
}

/** Bear / base / bull by shifting growth and discount rate. */
export function scenarios(a: DcfAssumptions) {
  const safe = (x: DcfAssumptions) => {
    try {
      return runDcf(x).intrinsicPerShare;
    } catch {
      return null;
    }
  };
  return {
    bear: safe({ ...a, growthRate: a.growthRate - 5, discountRate: a.discountRate + 1 }),
    base: safe(a),
    bull: safe({ ...a, growthRate: a.growthRate + 5, discountRate: Math.max(3, a.discountRate - 1) }),
  };
}

// ─── Defaults from history ───────────────────────────────────

export interface AnnualFinancials {
  year: number;
  freeCashFlow: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  revenue: number | null;
  netIncome: number | null;
  dilutedEps: number | null;
  shares: number | null;
  totalDebt: number | null;
  cash: number | null;
}

/** Compound annual growth rate between first and last positive values, percent. */
export function cagr(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null && x > 0);
  if (v.length < 2) return null;
  return (Math.pow(v[v.length - 1] / v[0], 1 / (v.length - 1)) - 1) * 100;
}

/** Sensible starting assumptions derived from reported history. */
export function suggestAssumptions(history: AnnualFinancials[], price: number | null): DcfAssumptions | null {
  const latest = [...history].reverse().find((h) => h.freeCashFlow != null && h.shares != null);
  if (!latest) return null;
  const fcfCagr = cagr(history.map((h) => h.freeCashFlow));
  const revCagr = cagr(history.map((h) => h.revenue));
  const hist = fcfCagr ?? revCagr ?? 5;
  const growth = Math.round(Math.max(0, Math.min(15, hist)) * 2) / 2;
  const avgFcf =
    history.slice(-3).reduce((s, h) => s + (h.freeCashFlow ?? 0), 0) / Math.max(1, history.slice(-3).filter((h) => h.freeCashFlow != null).length);

  return {
    // Normalize lumpy cash flow with the recent average when it's positive.
    baseFcf: avgFcf > 0 ? avgFcf : latest.freeCashFlow ?? 0,
    growthRate: growth,
    highGrowthYears: 5,
    terminalGrowth: 2.5,
    discountRate: 9,
    exitMultiple: null,
    cash: latest.cash ?? 0,
    debt: latest.totalDebt ?? 0,
    sharesOutstanding: latest.shares!,
    price,
  };
}
