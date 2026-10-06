export type RatioStatus = "green" | "yellow" | "red" | "gray";

export interface RatioScore {
  status: RatioStatus;
  label: string;
  warning?: string;
}

export type RatioMetricKey =
  | "trailingPe"
  | "forwardPe"
  | "pegRatio"
  | "enterpriseToEbitda"
  | "priceToBook"
  | "priceToSales"
  | "debtToEquity"
  | "returnOnEquity";

export const RATIO_DISPLAY: Record<
  RatioMetricKey,
  { name: string; format: "multiple" | "percent" | "ratio" }
> = {
  trailingPe: { name: "P/E (trailing)", format: "multiple" },
  forwardPe: { name: "Forward P/E", format: "multiple" },
  pegRatio: { name: "PEG", format: "multiple" },
  enterpriseToEbitda: { name: "EV/EBITDA", format: "multiple" },
  priceToBook: { name: "P/B", format: "multiple" },
  priceToSales: { name: "P/S", format: "multiple" },
  debtToEquity: { name: "Debt/Equity", format: "ratio" },
  returnOnEquity: { name: "ROE", format: "percent" },
};

function invalid(): RatioScore {
  return { status: "gray", label: "Not available" };
}

function scorePe(value: number): RatioScore {
  if (value < 0) return { status: "gray", label: "Negative earnings", warning: "P/E not meaningful" };
  if (value < 8) {
    return {
      status: "yellow",
      label: "Very cheap / distress risk",
      warning: "Extremely low P/E may signal distress rather than a bargain",
    };
  }
  if (value < 10) return { status: "yellow", label: "Very cheap", warning: "May indicate pessimism or cyclical downturn" };
  if (value <= 15) return { status: "green", label: "Traditional value range" };
  if (value <= 22) return { status: "yellow", label: "Fairly valued" };
  if (value <= 30) return { status: "yellow", label: "Expensive" };
  return { status: "red", label: "Overvalued" };
}

function scorePeg(value: number): RatioScore {
  if (value < 0) return invalid();
  if (value <= 1) return { status: "green", label: "Excellent" };
  if (value <= 1.5) return { status: "yellow", label: "Fairly valued" };
  if (value <= 2) return { status: "yellow", label: "Expensive" };
  return { status: "red", label: "Overvalued" };
}

function scoreEvEbitda(value: number): RatioScore {
  if (value < 0) return invalid();
  if (value < 6) {
    return {
      status: "yellow",
      label: "Deep value",
      warning: "Very low EV/EBITDA can signal structural decline (value trap)",
    };
  }
  if (value <= 10) return { status: "green", label: "Attractive value range" };
  if (value <= 15) return { status: "yellow", label: "Fairly valued" };
  if (value <= 23) return { status: "yellow", label: "Expensive" };
  return { status: "red", label: "Overvalued" };
}

function scorePb(value: number): RatioScore {
  if (value < 0) return invalid();
  if (value < 1) return { status: "yellow", label: "Deep value", warning: "Trading below book; verify asset quality" };
  if (value <= 2) return { status: "green", label: "Attractive value range" };
  if (value <= 4) return { status: "yellow", label: "Fairly valued" };
  if (value <= 6) return { status: "yellow", label: "Expensive" };
  return { status: "red", label: "Very expensive" };
}

function scorePs(value: number): RatioScore {
  if (value < 0) return invalid();
  if (value < 1) return { status: "yellow", label: "Deep value" };
  if (value <= 2) return { status: "green", label: "Attractive value range" };
  if (value <= 4) return { status: "yellow", label: "Fairly valued" };
  if (value <= 8) return { status: "yellow", label: "Expensive" };
  return { status: "red", label: "Very expensive" };
}

function scoreDebtEquity(value: number): RatioScore {
  if (value < 0) return invalid();
  if (value < 0.5) return { status: "green", label: "Very conservative" };
  if (value <= 1) return { status: "green", label: "Healthy balance" };
  if (value <= 2) return { status: "yellow", label: "Moderate leverage" };
  if (value <= 3) return { status: "yellow", label: "High leverage" };
  return { status: "red", label: "Very high leverage" };
}

/** ROE stored as decimal (0.18 = 18%) or percent (18) — normalize to percent */
function scoreRoe(value: number): RatioScore {
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  if (pct < 0) return invalid();
  if (pct < 10) return { status: "red", label: "Weak profitability" };
  if (pct < 15) return { status: "yellow", label: "Average performance" };
  if (pct < 20) return { status: "green", label: "Strong performance" };
  if (pct <= 25) return { status: "green", label: "Excellent performance" };
  return {
    status: "yellow",
    label: "Exceptional (check leverage)",
    warning: "Very high ROE may be inflated by leverage",
  };
}

export function scoreRatio(key: RatioMetricKey, value: number | null | undefined): RatioScore {
  if (value === null || value === undefined || Number.isNaN(value)) return invalid();

  switch (key) {
    case "trailingPe":
    case "forwardPe":
      return scorePe(value);
    case "pegRatio":
      return scorePeg(value);
    case "enterpriseToEbitda":
      return scoreEvEbitda(value);
    case "priceToBook":
      return scorePb(value);
    case "priceToSales":
      return scorePs(value);
    case "debtToEquity":
      return scoreDebtEquity(value);
    case "returnOnEquity":
      return scoreRoe(value);
    default:
      return invalid();
  }
}

export interface ScoredRatioRow {
  key: RatioMetricKey;
  name: string;
  value: number | null;
  formattedValue: string;
  score: RatioScore;
}

export function formatRatioValue(
  key: RatioMetricKey,
  value: number | null | undefined
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const { format } = RATIO_DISPLAY[key];
  if (format === "percent") {
    const pct = Math.abs(value) <= 1 ? value * 100 : value;
    return `${pct.toFixed(1)}%`;
  }
  return value.toFixed(2);
}

export interface SnapshotMetrics {
  trailingPe?: number | null;
  forwardPe?: number | null;
  pegRatio?: number | null;
  enterpriseToEbitda?: number | null;
  priceToBook?: number | null;
  priceToSales?: number | null;
  debtToEquity?: number | null;
  returnOnEquity?: number | null;
}

export function scoreAllRatios(metrics: SnapshotMetrics): ScoredRatioRow[] {
  const keys: RatioMetricKey[] = [
    "trailingPe",
    "forwardPe",
    "pegRatio",
    "enterpriseToEbitda",
    "priceToBook",
    "priceToSales",
    "debtToEquity",
    "returnOnEquity",
  ];

  return keys.map((key) => {
    const value = metrics[key] ?? null;
    return {
      key,
      name: RATIO_DISPLAY[key].name,
      value: value !== null && value !== undefined && !Number.isNaN(value) ? value : null,
      formattedValue: formatRatioValue(key, value),
      score: scoreRatio(key, value),
    };
  });
}

export function countByStatus(rows: ScoredRatioRow[]): {
  green: number;
  yellow: number;
  red: number;
  gray: number;
} {
  const counts = { green: 0, yellow: 0, red: 0, gray: 0 };
  for (const row of rows) {
    counts[row.score.status]++;
  }
  return counts;
}
