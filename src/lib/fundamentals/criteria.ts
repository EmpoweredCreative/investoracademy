import { z } from "zod";

/**
 * User-configurable research criteria. Thresholds are evaluated in code (exact, auditable);
 * Claude reads the results to give feedback but never decides pass/fail itself.
 *
 * All percent metrics are expressed in percent units (18 = 18%).
 */
export type CriteriaStatus = "green" | "yellow" | "red" | "gray";

export interface MetricDef {
  key: MetricKey;
  name: string;
  short: string;
  unit: "x" | "%";
  /** Which way is better. */
  better: "lower" | "higher";
  defaults: { good: number; ok: number; weight: number; enabled: boolean };
  /** Values below this are flagged (value traps, distress). */
  warnBelow?: { value: number; message: string };
  warnAbove?: { value: number; message: string };
  help: string;
}

export const METRIC_KEYS = [
  "trailingPe",
  "forwardPe",
  "pegRatio",
  "enterpriseToEbitda",
  "priceToBook",
  "priceToSales",
  "debtToEquity",
  "returnOnEquity",
  "profitMargin",
  "revenueGrowth",
  "earningsGrowth",
  "fcfYield",
  "currentRatio",
  "marginOfSafety",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRICS: Record<MetricKey, MetricDef> = {
  trailingPe: {
    key: "trailingPe", name: "P/E (trailing)", short: "P/E", unit: "x", better: "lower",
    defaults: { good: 15, ok: 22, weight: 2, enabled: true },
    warnBelow: { value: 8, message: "Very low P/E can signal distress rather than a bargain" },
    help: "Price ÷ last 12 months of earnings.",
  },
  forwardPe: {
    key: "forwardPe", name: "P/E (forward)", short: "Fwd P/E", unit: "x", better: "lower",
    defaults: { good: 15, ok: 22, weight: 1, enabled: true },
    help: "Price ÷ next 12 months of expected earnings.",
  },
  pegRatio: {
    key: "pegRatio", name: "PEG", short: "PEG", unit: "x", better: "lower",
    defaults: { good: 1, ok: 1.5, weight: 2, enabled: true },
    help: "P/E ÷ expected earnings growth. Below 1 means you pay little for growth.",
  },
  enterpriseToEbitda: {
    key: "enterpriseToEbitda", name: "EV/EBITDA", short: "EV/EBITDA", unit: "x", better: "lower",
    defaults: { good: 10, ok: 15, weight: 1, enabled: true },
    warnBelow: { value: 6, message: "Very low EV/EBITDA can signal structural decline (value trap)" },
    help: "Whole-company value ÷ operating earnings; ignores capital structure.",
  },
  priceToBook: {
    key: "priceToBook", name: "Price/Book", short: "P/B", unit: "x", better: "lower",
    defaults: { good: 2, ok: 4, weight: 1, enabled: true },
    warnBelow: { value: 1, message: "Trading below book; verify asset quality" },
    help: "Price ÷ accounting net worth per share.",
  },
  priceToSales: {
    key: "priceToSales", name: "Price/Sales", short: "P/S", unit: "x", better: "lower",
    defaults: { good: 2, ok: 4, weight: 1, enabled: true },
    help: "Market cap ÷ annual revenue.",
  },
  debtToEquity: {
    key: "debtToEquity", name: "Debt/Equity", short: "D/E", unit: "x", better: "lower",
    defaults: { good: 1, ok: 2, weight: 1, enabled: true },
    help: "Total debt ÷ shareholder equity.",
  },
  returnOnEquity: {
    key: "returnOnEquity", name: "Return on equity", short: "ROE", unit: "%", better: "higher",
    defaults: { good: 15, ok: 10, weight: 2, enabled: true },
    warnAbove: { value: 40, message: "Very high ROE may be inflated by leverage or buybacks" },
    help: "Net income ÷ shareholder equity.",
  },
  profitMargin: {
    key: "profitMargin", name: "Profit margin", short: "Margin", unit: "%", better: "higher",
    defaults: { good: 15, ok: 8, weight: 1, enabled: true },
    help: "Net income ÷ revenue.",
  },
  revenueGrowth: {
    key: "revenueGrowth", name: "Revenue growth (YoY)", short: "Rev growth", unit: "%", better: "higher",
    defaults: { good: 10, ok: 4, weight: 1, enabled: true },
    help: "Most recent quarter's revenue vs. a year earlier.",
  },
  earningsGrowth: {
    key: "earningsGrowth", name: "Earnings growth (YoY)", short: "EPS growth", unit: "%", better: "higher",
    defaults: { good: 10, ok: 4, weight: 1, enabled: false },
    help: "Most recent quarter's earnings vs. a year earlier.",
  },
  fcfYield: {
    key: "fcfYield", name: "Free cash flow yield", short: "FCF yield", unit: "%", better: "higher",
    defaults: { good: 5, ok: 3, weight: 2, enabled: true },
    help: "Free cash flow ÷ market cap. The cash return if you owned the whole company.",
  },
  currentRatio: {
    key: "currentRatio", name: "Current ratio", short: "Current", unit: "x", better: "higher",
    defaults: { good: 1.5, ok: 1, weight: 1, enabled: false },
    help: "Current assets ÷ current liabilities (short-term liquidity).",
  },
  marginOfSafety: {
    key: "marginOfSafety", name: "DCF margin of safety", short: "MoS", unit: "%", better: "higher",
    defaults: { good: 25, ok: 0, weight: 3, enabled: true },
    help: "How far price sits below your latest DCF intrinsic value.",
  },
};

export const criterionSchema = z.object({
  key: z.enum(METRIC_KEYS),
  enabled: z.boolean(),
  good: z.number(),
  ok: z.number(),
  weight: z.number().min(0).max(10),
  required: z.boolean().default(false),
});
export type Criterion = z.infer<typeof criterionSchema>;

export const criteriaProfileSchema = z.object({
  criteria: z.array(criterionSchema).min(1),
  /** Minimum weighted score (0–100) to call a stock a pass. */
  passScore: z.number().min(0).max(100).default(65),
});
export type CriteriaProfile = z.infer<typeof criteriaProfileSchema>;

export const DEFAULT_PROFILE: CriteriaProfile = {
  passScore: 65,
  criteria: METRIC_KEYS.map((key) => ({ key, ...METRICS[key].defaults, required: false })),
};

/** Merge a stored profile with the catalog so newly added metrics appear with defaults. */
export function normalizeProfile(stored: unknown): CriteriaProfile {
  const parsed = criteriaProfileSchema.safeParse(stored);
  if (!parsed.success) return DEFAULT_PROFILE;
  const byKey = new Map(parsed.data.criteria.map((c) => [c.key, c]));
  return {
    passScore: parsed.data.passScore,
    criteria: METRIC_KEYS.map((key) => byKey.get(key) ?? { key, ...METRICS[key].defaults, required: false }),
  };
}

export type MetricValues = Partial<Record<MetricKey, number | null>>;

export interface EvaluatedCriterion {
  key: MetricKey;
  name: string;
  short: string;
  value: number | null;
  formatted: string;
  status: CriteriaStatus;
  /** Plain-English rule, e.g. "≤ 15 good · ≤ 22 ok". */
  rule: string;
  required: boolean;
  weight: number;
  warning?: string;
}

export interface CriteriaEvaluation {
  rows: EvaluatedCriterion[];
  /** Weighted 0–100 score across metrics that have data. */
  score: number | null;
  passScore: number;
  verdict: "PASS" | "WATCH" | "FAIL" | "INSUFFICIENT_DATA";
  failedRequired: MetricKey[];
  counts: Record<CriteriaStatus, number>;
}

export function formatMetric(key: MetricKey, value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return METRICS[key].unit === "%" ? `${value.toFixed(1)}%` : `${value.toFixed(2)}×`;
}

export function ruleText(def: MetricDef, c: Criterion) {
  const op = def.better === "lower" ? "≤" : "≥";
  const u = def.unit === "%" ? "%" : "";
  return `${op} ${c.good}${u} good · ${op} ${c.ok}${u} ok`;
}

export function evaluateCriteria(values: MetricValues, profile: CriteriaProfile = DEFAULT_PROFILE): CriteriaEvaluation {
  const rows: EvaluatedCriterion[] = [];
  const counts: Record<CriteriaStatus, number> = { green: 0, yellow: 0, red: 0, gray: 0 };
  let weighted = 0;
  let weightTotal = 0;
  const failedRequired: MetricKey[] = [];

  for (const c of profile.criteria) {
    if (!c.enabled) continue;
    const def = METRICS[c.key];
    const value = values[c.key] ?? null;
    let status: CriteriaStatus = "gray";
    let warning: string | undefined;

    if (value != null && !Number.isNaN(value)) {
      if (def.better === "lower") {
        status = value < 0 ? "gray" : value <= c.good ? "green" : value <= c.ok ? "yellow" : "red";
      } else {
        status = value >= c.good ? "green" : value >= c.ok ? "yellow" : "red";
      }
      if (def.warnBelow && value >= 0 && value < def.warnBelow.value) {
        warning = def.warnBelow.message;
        if (status === "green") status = "yellow";
      }
      if (def.warnAbove && value > def.warnAbove.value) warning = def.warnAbove.message;
      if (def.better === "lower" && value < 0) warning = "Negative value: not meaningful";
    }

    if (status !== "gray") {
      weighted += c.weight * (status === "green" ? 1 : status === "yellow" ? 0.5 : 0);
      weightTotal += c.weight;
    }
    if (c.required && status !== "green") failedRequired.push(c.key);
    counts[status]++;
    rows.push({
      key: c.key,
      name: def.name,
      short: def.short,
      value,
      formatted: formatMetric(c.key, value),
      status,
      rule: ruleText(def, c),
      required: c.required,
      weight: c.weight,
      warning,
    });
  }

  const score = weightTotal > 0 ? Math.round((weighted / weightTotal) * 100) : null;
  const verdict =
    score == null
      ? "INSUFFICIENT_DATA"
      : failedRequired.length > 0
        ? "FAIL"
        : score >= profile.passScore
          ? "PASS"
          : score >= profile.passScore - 20
            ? "WATCH"
            : "FAIL";

  return { rows, score, passScore: profile.passScore, verdict, failedRequired, counts };
}

// ─── Extract metric values from a Yahoo snapshot ─────────────

type Num = { toNumber(): number } | number | null | undefined;

/** Apply a statement→price currency correction; unknown rate → value unavailable. */
function adjust(v: number | null, fx: number | null, how: "divide") {
  if (v == null) return null;
  if (fx == null) return null;
  return how === "divide" ? v / fx : v;
}
const n = (v: Num) => (v == null ? null : typeof v === "number" ? v : v.toNumber());
const pct = (v: number | null) => (v == null ? null : Math.abs(v) <= 1.5 ? v * 100 : v);

interface SnapshotLike {
  trailingPe?: Num;
  forwardPe?: Num;
  pegRatio?: Num;
  enterpriseToEbitda?: Num;
  priceToBook?: Num;
  priceToSales?: Num;
  debtToEquity?: Num;
  returnOnEquity?: Num;
  profitMargins?: Num;
  raw?: unknown;
}

/**
 * Normalize Yahoo fields into criteria units.
 * Yahoo reports debtToEquity as a percent (33 = 0.33×) and growth/margins as decimals.
 *
 * `fx` converts statement currency into the trading currency (foreign filers / ADRs, e.g.
 * CNY statements with a USD price). Yahoo's EV/EBITDA, P/S and FCF yield mix the two currencies
 * for those, so they are corrected here; null `fx` means a conversion was needed but unavailable.
 */
export function metricValuesFromSnapshot(
  s: SnapshotLike,
  extras: { marginOfSafety?: number | null; fx?: number | null } = {}
): MetricValues {
  const fx = extras.fx === undefined ? 1 : extras.fx;
  const raw = (s.raw ?? {}) as {
    financialData?: {
      revenueGrowth?: number;
      earningsGrowth?: number;
      freeCashflow?: number;
      currentRatio?: number;
      ebitda?: number;
      totalCash?: number;
      totalDebt?: number;
    };
    summaryDetail?: { marketCap?: number };
    price?: { marketCap?: number };
  };
  const fd = raw.financialData ?? {};
  const marketCap = raw.summaryDetail?.marketCap ?? raw.price?.marketCap ?? null;
  const de = n(s.debtToEquity);

  // Yahoo's enterpriseValue for foreign filers adds a quote-currency market cap to
  // statement-currency debt and cash, so rebuild EV/EBITDA from its parts when converting.
  let evEbitda = n(s.enterpriseToEbitda);
  if (fx !== 1) {
    const { ebitda, totalCash, totalDebt } = fd;
    evEbitda =
      fx != null && marketCap && typeof ebitda === "number" && ebitda > 0 && typeof totalCash === "number" && typeof totalDebt === "number"
        ? (marketCap + (totalDebt - totalCash) * fx) / (ebitda * fx)
        : null;
  }

  return {
    trailingPe: n(s.trailingPe),
    forwardPe: n(s.forwardPe),
    pegRatio: n(s.pegRatio),
    enterpriseToEbitda: evEbitda,
    priceToBook: n(s.priceToBook),
    priceToSales: adjust(n(s.priceToSales), fx, "divide"),
    debtToEquity: de == null ? null : de / 100,
    returnOnEquity: pct(n(s.returnOnEquity)),
    profitMargin: pct(n(s.profitMargins)),
    revenueGrowth: typeof fd.revenueGrowth === "number" ? fd.revenueGrowth * 100 : null,
    earningsGrowth: typeof fd.earningsGrowth === "number" ? fd.earningsGrowth * 100 : null,
    fcfYield:
      typeof fd.freeCashflow === "number" && marketCap && fx != null ? ((fd.freeCashflow * fx) / marketCap) * 100 : null,
    currentRatio: typeof fd.currentRatio === "number" ? fd.currentRatio : null,
    marginOfSafety: extras.marginOfSafety ?? null,
  };
}
