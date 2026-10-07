/**
 * The six numbers that say whether someone is winning: cash flow, net worth,
 * ROI on capital used, stock assets gained, debt reduction and interest paid.
 * Each compares the last full month with the month before it.
 */

import type { InvestingYear } from "./investing";
import { averageCapital, monthlyRoi, type CapitalItem } from "./capital";

export type StatKey = "cashFlow" | "netWorth" | "roi" | "stockGained" | "debtReduction" | "interest";
export type StatFormat = "money" | "percent";

export interface Stat {
  key: StatKey;
  label: string;
  format: StatFormat;
  /** Headline value (last full month, or "now" for net worth and interest). */
  value: number | null;
  /** The comparison value it's judged against. */
  previous: number | null;
  change: number | null;
  /** true = winning, false = losing, null = not enough history. */
  winning: boolean | null;
  /** What the headline refers to, e.g. "September" or "Now". */
  period: string;
  sub: string;
  /** 12 points for the sparkline/detail chart, labeled by `seriesLabels`. */
  series: (number | null)[];
  seriesLabels: string[];
  seriesNote: string;
  estimated: boolean;
}

export interface ScoreboardInput {
  today: string; // YYYY-MM-DD
  year: InvestingYear;
  personalMonthly: number | null; // Foundation's monthly left-over (null if not set up)
  netWorth: number;
  history: { month: string; netWorth: number; liabilities: number }[];
  capital: CapitalItem[];
  debts: { balance: number; apr: number | null; payment: number }[]; // payment = principal & interest
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function shift(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const monthName = (ym: string) => FULL[Number(ym.slice(5, 7)) - 1];
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function judge(value: number | null, previous: number | null, higherIsBetter = true) {
  if (value == null || previous == null) return { change: null, winning: null };
  const change = value - previous;
  return { change, winning: higherIsBetter ? change >= 0 : change <= 0 };
}

/** One month of interest and principal across all debts, then balances roll forward. */
function debtMonth(debts: { balance: number; apr: number | null; payment: number }[]) {
  let interest = 0;
  let principal = 0;
  const next = debts.map((d) => {
    const i = d.balance * ((d.apr ?? 0) / 100 / 12);
    const p = Math.max(0, Math.min(d.balance, d.payment - i));
    interest += i;
    principal += p;
    return { ...d, balance: d.balance - p };
  });
  return { interest, principal, next };
}

export function scoreboard(input: ScoreboardInput): { stats: Stat[]; winning: number; scored: number } {
  const current = input.today.slice(0, 7);
  const ref = shift(current, -1); // last full month
  const prior = shift(current, -2);
  const yearMonths = input.year.months;
  const byMonth = new Map(yearMonths.map((m) => [m.month, m]));
  const income = (ym: string) => (byMonth.get(ym) && !byMonth.get(ym)!.projected ? byMonth.get(ym)!.total : null);
  const labels12 = yearMonths.map((m) => MONTHS[Number(m.month.slice(5, 7)) - 1]);
  const isPast = (ym: string) => ym <= current;
  const personal = input.personalMonthly ?? 0;

  // 1. Cash flow (personal left-over + investment income)
  const cf = (ym: string) => (income(ym) == null ? null : personal + income(ym)!);
  const cfJ = judge(cf(ref), cf(prior));
  const cashFlow: Stat = {
    key: "cashFlow",
    label: "Cash flow",
    format: "money",
    value: cf(ref),
    previous: cf(prior),
    ...cfJ,
    period: monthName(ref),
    sub: `${input.personalMonthly != null ? `${usd(personal)} personal + ` : ""}${usd(income(ref) ?? 0)} investing · ${monthName(current)} so far ${usd(income(current) ?? 0)} investing`,
    series: yearMonths.map((m) => (isPast(m.month) ? cf(m.month) : null)),
    seriesLabels: labels12,
    seriesNote: "Personal left-over each month plus option income and dividends.",
    estimated: false,
  };

  // 2. Net worth (now vs end of last month)
  const hist = new Map(input.history.map((h) => [h.month, h]));
  const nwPrev = hist.get(ref)?.netWorth ?? null;
  const nwJ = judge(input.netWorth, nwPrev);
  const netWorth: Stat = {
    key: "netWorth",
    label: "Net worth",
    format: "money",
    value: input.netWorth,
    previous: nwPrev,
    ...nwJ,
    period: "Now",
    sub: nwPrev != null ? `vs ${usd(nwPrev)} at the end of ${monthName(ref)}` : "Tracked monthly from here",
    series: yearMonths.map((m) => (m.month === current ? input.netWorth : hist.get(m.month)?.netWorth ?? null)),
    seriesLabels: labels12,
    seriesNote: "Assets minus debts, saved once a month.",
    estimated: false,
  };

  // 3. ROI on capital used (buying power effect)
  const roiFor = (ym: string) => {
    const inc = income(ym);
    if (inc == null) return { roi: null as number | null, capital: 0, est: 0 };
    const cap = averageCapital(input.capital, ym, input.today);
    return { roi: monthlyRoi(inc, cap.average)?.roi ?? null, capital: cap.average, est: cap.estimatedShare };
  };
  const rRef = roiFor(ref);
  const rPrior = roiFor(prior);
  const roi: Stat = {
    key: "roi",
    label: "ROI on capital used",
    format: "percent",
    value: rRef.roi,
    previous: rPrior.roi,
    ...judge(rRef.roi, rPrior.roi),
    period: monthName(ref),
    sub:
      rRef.roi != null
        ? `${usd(income(ref) ?? 0)} on ${usd(rRef.capital)} avg buying power · ≈ ${pct(rRef.roi * 12)} a year`
        : "No capital in use that month",
    series: yearMonths.map((m) => (isPast(m.month) ? roiFor(m.month).roi : null)),
    seriesLabels: labels12,
    seriesNote: "Option income and dividends ÷ average buying power held by open positions.",
    estimated: rRef.est > 0.5,
  };

  // 4. Stock assets gained (cost of shares added)
  const sharesCost = (ym: string) => byMonth.get(ym)?.shares.cost ?? 0;
  const refSymbols = byMonth.get(ref)?.shares.symbols ?? [];
  const stockGained: Stat = {
    key: "stockGained",
    label: "Stock assets gained",
    format: "money",
    value: sharesCost(ref),
    previous: sharesCost(prior),
    // No purchases in either month is neutral, not a win.
    ...(sharesCost(ref) === 0 && sharesCost(prior) === 0 ? { change: 0, winning: null } : judge(sharesCost(ref), sharesCost(prior))),
    period: monthName(ref),
    sub: refSymbols.length
      ? `${refSymbols.map((s) => `+${s.shares} ${s.symbol}`).join(", ")} · ${usd(input.year.shares.cost)} this year`
      : `${usd(input.year.shares.cost)} added this year`,
    series: yearMonths.map((m) => (isPast(m.month) ? m.shares.cost : null)),
    seriesLabels: labels12,
    seriesNote: "Cost of new shares bought each month (including assignments).",
    estimated: false,
  };

  // 5. Debt reduction (liabilities drop month over month; scheduled principal when history is short)
  const liab = (ym: string) => hist.get(ym)?.liabilities ?? null;
  const reduction = (ym: string) => {
    const before = liab(shift(ym, -1));
    const after = ym === current ? null : liab(ym);
    return before != null && after != null ? before - after : null;
  };
  const scheduled = debtMonth(input.debts).principal;
  const redRef = reduction(ref);
  const redPrior = reduction(prior);
  const usingSchedule = redRef == null;
  const debtValue = redRef ?? (input.debts.length ? scheduled : null);
  const debtReduction: Stat = {
    key: "debtReduction",
    label: "Debt reduction",
    format: "money",
    value: debtValue,
    previous: redPrior,
    ...(usingSchedule ? { change: null, winning: debtValue != null ? debtValue > 0 : null } : judge(redRef, redPrior)),
    period: usingSchedule ? "Per month" : monthName(ref),
    sub: usingSchedule
      ? input.debts.length
        ? "Principal your current payments retire each month"
        : "No debt to pay down"
      : `Debt fell ${usd(redRef!)} in ${monthName(ref)}`,
    series: yearMonths.map((m) => reduction(m.month)),
    seriesLabels: labels12,
    seriesNote: "How much total debt went down each month.",
    estimated: usingSchedule,
  };

  // 6. Interest paid to lenders (this month vs last month's balances)
  const now = debtMonth(input.debts);
  const lastMonthDebts = input.debts.map((d) => {
    // Roll each balance back one payment to estimate last month's interest.
    const r = (d.apr ?? 0) / 100 / 12;
    return { ...d, balance: r > 0 ? (d.balance + d.payment) / (1 + r) : d.balance + d.payment };
  });
  const last = debtMonth(lastMonthDebts);
  const forward: number[] = [];
  let roll = input.debts;
  for (let i = 0; i < 12; i++) {
    const m = debtMonth(roll);
    forward.push(Math.round(m.interest));
    roll = m.next;
  }
  const interest: Stat = {
    key: "interest",
    label: "Interest paid to lenders",
    format: "money",
    value: input.debts.length ? now.interest : 0,
    previous: input.debts.length ? last.interest : null,
    ...judge(input.debts.length ? now.interest : null, input.debts.length ? last.interest : null, false),
    period: "This month",
    sub: input.debts.length ? `≈ ${usd(forward.reduce((a, b) => a + b, 0))} over the next 12 months at current payments` : "No interest-bearing debt",
    series: forward,
    seriesLabels: Array.from({ length: 12 }, (_, i) => MONTHS[(Number(current.slice(5, 7)) - 1 + i) % 12]),
    seriesNote: "Interest you'll pay each month for the next year at your current payments.",
    estimated: true,
  };

  const stats = [cashFlow, netWorth, roi, stockGained, debtReduction, interest];
  const scored = stats.filter((s) => s.winning != null).length;
  return { stats, winning: stats.filter((s) => s.winning).length, scored };
}
