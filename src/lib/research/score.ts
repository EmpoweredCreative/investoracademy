import { METRICS, type CriteriaEvaluation, type MetricKey, type MetricValues } from "@/lib/fundamentals/criteria";
import type { AnnualFacts, FinancialKind } from "@/lib/sec/xbrl";
import { APP_NAME } from "@/lib/brand";

/**
 * The WealthOS Score: one 0–100 number per stock and lens, built from pillars
 * that are computed in code from data (the only AI-derived inputs are the
 * report's structured moat rating and risk severities). Weights follow the lens.
 */
export const SCORE_NAME = `${APP_NAME} Score`;

export const PILLARS = ["quality", "growth", "strength", "valuation", "moat", "momentum"] as const;
export type PillarKey = (typeof PILLARS)[number];

export const PILLAR_LABELS: Record<PillarKey, string> = {
  quality: "Quality",
  growth: "Growth",
  strength: "Strength",
  valuation: "Valuation",
  moat: "Moat & risk",
  momentum: "Momentum",
};

export type PillarWeights = Record<PillarKey, number>;

/** How much each pillar counts under each lens (sums to 100). */
export const LENS_WEIGHTS: Record<"general" | "buffett" | "lynch" | "druckenmiller", PillarWeights> = {
  general: { quality: 25, growth: 15, strength: 15, valuation: 25, moat: 20, momentum: 0 },
  buffett: { quality: 30, growth: 10, strength: 15, valuation: 20, moat: 25, momentum: 0 },
  lynch: { quality: 15, growth: 30, strength: 15, valuation: 25, moat: 15, momentum: 0 },
  druckenmiller: { quality: 10, growth: 30, strength: 10, valuation: 10, moat: 10, momentum: 30 },
};

export function weightsForLens(lensKey: string, baseLens?: string | null): PillarWeights {
  const k = (lensKey in LENS_WEIGHTS ? lensKey : baseLens && baseLens in LENS_WEIGHTS ? baseLens : "general") as keyof typeof LENS_WEIGHTS;
  return LENS_WEIGHTS[k];
}

export interface ScoreInput {
  weights: PillarWeights;
  financialKind: FinancialKind;
  /** Live metrics in criteria units (percents as percents). */
  metrics: MetricValues;
  /** The lens's criteria evaluation (thresholds drive the valuation pillar). */
  criteria: CriteriaEvaluation | null;
  /** Annual SEC figures, oldest first (≈10 years). */
  years: AnnualFacts[] | null;
  dcf: { marginOfSafety: number | null; terminalShare: number | null } | null;
  report: { moat: "NONE" | "NARROW" | "WIDE"; risks: { severity: "high" | "medium" | "low"; trend: string }[] } | null;
  momentum: {
    aboveSma200: boolean | null;
    change12mPct: number | null;
    revisionsUp30d: number | null;
    revisionsDown30d: number | null;
  } | null;
  /** Extra screener-only metrics (Finviz) used when SEC history isn't loaded. */
  extra?: { epsGrowth5y?: number | null; salesGrowth5y?: number | null; roic?: number | null; operatingMargin?: number | null };
  /** Scored from live/screener metrics only (no SEC history, report or DCF). */
  quick?: boolean;
}

export interface PillarResult {
  key: PillarKey;
  label: string;
  score: number | null;
  weight: number;
  notes: string[];
}

export interface ScoreResult {
  score: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  quick: boolean;
  pillars: PillarResult[];
  caps: string[];
  strengths: string[];
  weaknesses: string[];
}

// ── helpers ─────────────────────────────────────────────────────────────────

const clamp = (v: number) => Math.max(0, Math.min(100, v));
/** Linear 0–100 between `bad` and `good` (works in either direction). */
export function scale(v: number | null | undefined, bad: number, good: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return clamp(((v - bad) / (good - bad)) * 100);
}
/** Weighted mean of the parts that have values. */
function blend(parts: [number | null, number][]): number | null {
  let sum = 0;
  let w = 0;
  for (const [v, weight] of parts) {
    if (v == null) continue;
    sum += v * weight;
    w += weight;
  }
  return w ? sum / w : null;
}
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const series = (years: AnnualFacts[], f: (y: AnnualFacts) => number | undefined) =>
  years.map(f).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
/** Compound annual growth between the first and last positive values over the last `n` years. */
function cagr(years: AnnualFacts[], f: (y: AnnualFacts) => number | undefined, n = 5): number | null {
  const recent = years.slice(-(n + 1));
  const first = recent.find((y) => (f(y) ?? 0) > 0);
  const last = recent[recent.length - 1];
  const a = first ? f(first) : undefined;
  const b = last ? f(last) : undefined;
  if (!first || !last || a == null || b == null || a <= 0 || b <= 0 || last.fiscalYear <= first.fiscalYear) return null;
  return (Math.pow(b / a, 1 / (last.fiscalYear - first.fiscalYear)) - 1) * 100;
}
const pct = (v: number) => `${v.toFixed(v >= 10 || v <= -10 ? 0 : 1)}%`;

// ── pillars ─────────────────────────────────────────────────────────────────

function quality(i: ScoreInput): Omit<PillarResult, "weight" | "label"> {
  const fin = i.financialKind != null;
  const notes: string[] = [];
  const ys = i.years ?? [];
  if (ys.length >= 3) {
    const returns = series(ys, (y) => (fin ? y.roe : (y.roic ?? y.roe)));
    const label = fin ? "ROE" : ys.some((y) => y.roic != null) ? "ROIC" : "ROE";
    const med = median(returns);
    const bar = fin ? 10 : 12;
    const hits = returns.filter((r) => r >= bar).length;
    const margins = series(ys, (y) => y.operatingMargin);
    let stability: number | null = null;
    if (!fin && margins.length >= 3) {
      const mean = margins.reduce((s, v) => s + v, 0) / margins.length;
      const sd = Math.sqrt(margins.reduce((s, v) => s + (v - mean) ** 2, 0) / margins.length);
      stability = mean > 0 ? scale(sd / mean, 0.5, 0.08) : 0;
      notes.push(`Operating margin ${stability != null && stability >= 70 ? "steady" : "uneven"} around ${pct(mean)}`);
    }
    const last5 = ys.slice(-5);
    const fcf = series(last5, (y) => y.freeCashFlow).reduce((s, v) => s + v, 0);
    const ni = series(last5, (y) => y.netIncome).reduce((s, v) => s + v, 0);
    const conversion = !fin && ni > 0 && last5.some((y) => y.freeCashFlow != null) ? scale(fcf / ni, 0.4, 1.0) : null;
    if (med != null) notes.unshift(`${label} median ${pct(med)} over ${returns.length} yrs; ≥${bar}% in ${hits} of ${returns.length}`);
    if (conversion != null) notes.push(`FCF is ${pct((fcf / ni) * 100)} of net income (5 yrs)`);
    return {
      key: "quality",
      score: blend([
        [scale(med, fin ? 6 : 5, fin ? 15 : 20), 3],
        [returns.length ? (hits / returns.length) * 100 : null, 2],
        [stability, 1.5],
        [conversion, 1.5],
      ]),
      notes,
    };
  }
  const roe = i.metrics.returnOnEquity ?? null;
  const roic = i.extra?.roic ?? null;
  if (roic != null) notes.push(`ROIC ${pct(roic)}`);
  if (roe != null) notes.push(`ROE ${pct(roe)}`);
  return {
    key: "quality",
    score: blend([
      [scale(roic, 5, 20), 2],
      [scale(roe, 5, 20), 2],
      [scale(i.metrics.profitMargin ?? i.extra?.operatingMargin ?? null, 3, 20), 1],
    ]),
    notes,
  };
}

function growth(i: ScoreInput): Omit<PillarResult, "weight" | "label"> {
  const notes: string[] = [];
  const ys = i.years ?? [];
  let rev: number | null = null;
  let eps: number | null = null;
  let fcf: number | null = null;
  if (ys.length >= 4) {
    rev = cagr(ys, (y) => y.revenue);
    eps = cagr(ys, (y) => y.dilutedEps);
    fcf = i.financialKind ? null : cagr(ys, (y) => y.freeCashFlow);
  }
  rev ??= i.extra?.salesGrowth5y ?? null;
  eps ??= i.extra?.epsGrowth5y ?? null;
  if (rev != null) notes.push(`Revenue ${rev >= 0 ? "+" : ""}${pct(rev)}/yr`);
  if (eps != null) notes.push(`EPS ${eps >= 0 ? "+" : ""}${pct(eps)}/yr`);
  if (fcf != null) notes.push(`FCF ${fcf >= 0 ? "+" : ""}${pct(fcf)}/yr`);
  const up = i.momentum?.revisionsUp30d ?? null;
  const down = i.momentum?.revisionsDown30d ?? null;
  const net = up != null && down != null ? up - down : null;
  if (net != null) notes.push(`Estimates: ${up} raised, ${down} cut (30 days)`);
  return {
    key: "growth",
    score: blend([
      [scale(rev, 0, 12), 2],
      [scale(eps, 0, 15), 2],
      [scale(fcf, 0, 12), 1],
      [rev == null && eps == null ? scale(i.metrics.revenueGrowth ?? null, 0, 15) : null, 1],
      [rev == null && eps == null ? scale(i.metrics.earningsGrowth ?? null, 0, 20) : null, 1],
      [scale(net, -5, 5), 1],
    ]),
    notes,
  };
}

function strength(i: ScoreInput): Omit<PillarResult, "weight" | "label"> {
  const notes: string[] = [];
  const ys = i.years ?? [];
  const last = ys[ys.length - 1];
  if (i.financialKind) {
    const losses = series(ys.slice(-5), (y) => y.netIncome).filter((v) => v < 0).length;
    const eqGrowth = cagr(ys, (y) => y.equity);
    const ratio = last?.equity != null && last?.totalAssets ? last.equity / last.totalAssets : null;
    const [bad, good] = i.financialKind === "bank" ? [0.06, 0.12] : [0.1, 0.3];
    if (ratio != null) notes.push(`Equity is ${pct(ratio * 100)} of assets`);
    if (eqGrowth != null) notes.push(`Book value ${eqGrowth >= 0 ? "+" : ""}${pct(eqGrowth)}/yr`);
    notes.push(losses ? `${losses} loss year${losses > 1 ? "s" : ""} in the last 5` : "Profitable every year in the last 5");
    return {
      key: "strength",
      score: blend([
        [ys.length ? clamp(100 - losses * 40) : null, 2],
        [scale(eqGrowth, 0, 10), 1.5],
        [scale(ratio, bad, good), 1.5],
      ]),
      notes,
    };
  }
  const de = last?.totalDebt != null && last?.equity ? last.totalDebt / last.equity : (i.metrics.debtToEquity ?? null);
  const netDebt = last?.totalDebt != null && last?.cash != null ? last.totalDebt - last.cash : null;
  const fcf = last?.freeCashFlow ?? null;
  let payback: number | null = null;
  if (netDebt != null) {
    if (netDebt <= 0) {
      payback = 100;
      notes.push("More cash than debt");
    } else if (fcf != null && fcf > 0) {
      payback = scale(netDebt / fcf, 6, 1);
      notes.push(`Net debt = ${(netDebt / fcf).toFixed(1)} yrs of FCF`);
    } else payback = 0;
  }
  if (de != null) notes.unshift(`Debt/Equity ${de.toFixed(2)}`);
  return {
    key: "strength",
    score: blend([
      [de != null && de < 0 ? 10 : scale(de, 2, 0.2), 2],
      [payback, 2],
      [scale(i.metrics.currentRatio ?? null, 0.8, 2), 0.5],
    ]),
    notes,
  };
}

const VALUATION_KEYS: MetricKey[] = ["trailingPe", "forwardPe", "pegRatio", "enterpriseToEbitda", "priceToBook", "priceToSales", "fcfYield"];
const FIN_VALUATION_KEYS: MetricKey[] = ["trailingPe", "forwardPe", "pegRatio", "priceToBook"];
const STATUS_POINTS = { green: 100, yellow: 55, red: 10 } as const;

function valuation(i: ScoreInput): Omit<PillarResult, "weight" | "label"> {
  const notes: string[] = [];
  const keys = i.financialKind ? FIN_VALUATION_KEYS : VALUATION_KEYS;
  const rows = (i.criteria?.rows ?? []).filter((r) => keys.includes(r.key) && r.status !== "gray");
  const ratios = rows.length ? rows.reduce((s, r) => s + STATUS_POINTS[r.status as keyof typeof STATUS_POINTS], 0) / rows.length : null;
  if (rows.length) {
    const good = rows.filter((r) => r.status === "green").map((r) => `${r.short} ${r.formatted}`);
    notes.push(good.length ? `Meets your bar: ${good.slice(0, 3).join(", ")}` : `No valuation metric meets your “good” bar`);
  }

  let model: number | null = null;
  let modelWeight = 2;
  if (i.financialKind) {
    // Justified P/B ≈ ROE ÷ cost of equity (~10%): paying 1.5× book for a 15% ROE is fair.
    const ys = i.years ?? [];
    const roe = median(series(ys.slice(-5), (y) => y.roe)) ?? i.metrics.returnOnEquity ?? null;
    const pb = i.metrics.priceToBook ?? null;
    if (roe != null && pb != null && pb > 0) {
      const ratio = roe / 10 / pb;
      model = scale(ratio, 0.6, 1.5);
      notes.push(`P/B ${pb.toFixed(2)} vs ROE ${pct(roe)} (fair ≈ ${(roe / 10).toFixed(2)}×)`);
    }
    notes.push(`DCF not used: ${i.financialKind === "insurer" ? "insurer" : "bank"} cash flows include customer money`);
  } else if (i.dcf?.marginOfSafety != null) {
    model = scale(i.dcf.marginOfSafety, -30, 40);
    if ((i.dcf.terminalShare ?? 0) > 75) {
      modelWeight = 1;
      notes.push(`Your DCF: ${pct(i.dcf.marginOfSafety)} margin of safety (counted less: ${pct(i.dcf.terminalShare!)} from terminal value)`);
    } else notes.push(`Your DCF: ${pct(i.dcf.marginOfSafety)} margin of safety`);
  }
  return { key: "valuation", score: blend([[ratios, 2], [model, modelWeight]]), notes };
}

function moat(i: ScoreInput): Omit<PillarResult, "weight" | "label"> {
  if (!i.report) return { key: "moat", score: null, notes: ["Needs a Company Report"] };
  const moatScore = { NONE: 15, NARROW: 60, WIDE: 95 }[i.report.moat];
  let risk = 100;
  for (const r of i.report.risks) {
    const worsening = r.trend === "new" || r.trend === "rising";
    if (r.severity === "high") risk -= worsening ? 25 : 12;
    else if (r.severity === "medium" && worsening) risk -= 8;
  }
  risk = clamp(risk);
  const highRising = i.report.risks.filter((r) => r.severity === "high" && (r.trend === "new" || r.trend === "rising")).length;
  return {
    key: "moat",
    score: moatScore * 0.6 + risk * 0.4,
    notes: [
      `${i.report.moat === "NONE" ? "No" : i.report.moat === "WIDE" ? "Wide" : "Narrow"} moat`,
      highRising ? `${highRising} high risk${highRising > 1 ? "s" : ""} new or rising` : "No high risks getting worse",
    ],
  };
}

function momentum(i: ScoreInput): Omit<PillarResult, "weight" | "label"> {
  const m = i.momentum;
  if (!m) return { key: "momentum", score: null, notes: ["No price-trend data"] };
  const notes: string[] = [];
  if (m.aboveSma200 != null) notes.push(m.aboveSma200 ? "Above its 200-day average" : "Below its 200-day average");
  if (m.change12mPct != null) notes.push(`${m.change12mPct >= 0 ? "+" : ""}${pct(m.change12mPct)} over 12 months`);
  const net = m.revisionsUp30d != null && m.revisionsDown30d != null ? m.revisionsUp30d - m.revisionsDown30d : null;
  return {
    key: "momentum",
    score: blend([
      [m.aboveSma200 == null ? null : m.aboveSma200 ? 100 : 20, 1.5],
      [scale(m.change12mPct, -20, 30), 1],
      [scale(net, -5, 5), 1],
    ]),
    notes,
  };
}

// ── overall ─────────────────────────────────────────────────────────────────

export function computeScore(i: ScoreInput): ScoreResult {
  const parts = [quality(i), growth(i), strength(i), valuation(i), moat(i), momentum(i)];
  const pillars: PillarResult[] = parts
    .map((p) => ({ ...p, label: PILLAR_LABELS[p.key], weight: i.weights[p.key], score: p.score == null ? null : Math.round(p.score) }))
    .filter((p) => p.weight > 0);

  const raw = blend(pillars.map((p) => [p.score, p.weight]));
  let score = raw == null ? null : Math.round(raw);

  // Red flags cap the score however good the rest looks.
  const caps: string[] = [];
  const cap = (limit: number, reason: string) => {
    caps.push(reason);
    if (score != null) score = Math.min(score, limit);
  };
  if (i.criteria?.failedRequired.length) {
    cap(49, `Fails a must-have rule: ${i.criteria.failedRequired.map((k) => METRICS[k].name).join(", ")}`);
  }
  const ys = i.years ?? [];
  const lastTwo = ys.slice(-2);
  if (!i.financialKind && lastTwo.length === 2 && lastTwo.every((y) => (y.freeCashFlow ?? 0) < 0)) cap(49, "Negative free cash flow two years running");
  const lastNi = ys[ys.length - 1]?.netIncome;
  if (lastNi != null && lastNi < 0) cap(45, "Lost money last fiscal year");

  const totalWeight = pillars.reduce((s, p) => s + p.weight, 0);
  const covered = pillars.filter((p) => p.score != null).reduce((s, p) => s + p.weight, 0);
  const coverage = totalWeight ? covered / totalWeight : 0;
  const confidence: ScoreResult["confidence"] =
    i.quick || coverage < 0.7 ? "LOW" : coverage >= 0.95 && ys.length >= 7 ? "HIGH" : "MEDIUM";

  const ranked = pillars.filter((p) => p.score != null).sort((a, b) => b.score! - a.score!);
  const strengths = ranked.filter((p) => p.score! >= 70).slice(0, 2).map((p) => `${p.label}: ${p.notes[0] ?? `${p.score}/100`}`);
  const weaknesses = [
    ...caps,
    ...ranked
      .filter((p) => p.score! < 50)
      .reverse()
      .slice(0, 2)
      .map((p) => `${p.label}: ${p.notes[0] ?? `${p.score}/100`}`),
  ];

  return { score, confidence, quick: Boolean(i.quick), pillars, caps, strengths, weaknesses };
}
