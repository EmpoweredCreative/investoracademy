import type { FoundationSummary } from "@/lib/foundation/calc";
import type { CalendarEvent } from "@/lib/marketdata/fred";

/** Positions flagged for triage (shared with Trader's Corner Step 3). */
export const SICK_UNREALIZED_PCT = -10;
export const SICK_DAY_PCT = -3;
/** Credit card use above this hurts credit scores. */
export const UTILIZATION_WARN = 0.3;
/** Debt balances older than this should be re-verified. */
export const STALE_BALANCE_DAYS = 45;
export const MAX_ATTENTION_ITEMS = 5;

export type Severity = "danger" | "warning" | "info";

export interface AttentionItem {
  key: string;
  severity: Severity;
  message: string;
  href: string;
}

export interface HoldingSignal {
  symbol: string;
  accountId: string;
  unrealizedPct: number | null;
  dayPct: number | null;
}

const RANK: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function isSick(h: HoldingSignal) {
  return (h.unrealizedPct ?? 0) <= SICK_UNREALIZED_PCT || (h.dayPct ?? 0) <= SICK_DAY_PCT;
}

/** The most important things to act on, highest severity first, capped at 5. */
export function attentionItems(input: {
  today: string; // YYYY-MM-DD
  foundation: FoundationSummary | null;
  debts: { lender: string; balanceAsOf: string; paidOffAt: string | null }[];
  holdings: HoldingSignal[];
  events: CalendarEvent[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const f = input.foundation;

  if (f) {
    if (f.income.netMonthly > 0 && f.cashFlow.monthly < 0) {
      items.push({
        key: "overspending",
        severity: "danger",
        message: `Spending is ${usd(-f.cashFlow.monthly)}/mo more than you bring home`,
        href: "/foundation/budget",
      });
    }
    for (const d of f.debt.items.filter((x) => x.notPayingDown)) {
      items.push({ key: `stuck:${d.id}`, severity: "danger", message: `${d.lender}: the payment doesn't cover the interest`, href: "/foundation/debt" });
    }
  }

  const sick = input.holdings.filter(isSick).sort((a, b) => (a.unrealizedPct ?? 0) - (b.unrealizedPct ?? 0));
  if (sick.length) {
    const names = sick.slice(0, 2).map((h) => h.symbol).join(", ");
    items.push({
      key: "positions",
      severity: "warning",
      message: `${sick.length} position${sick.length > 1 ? "s" : ""} need${sick.length > 1 ? "" : "s"} attention: ${names}${sick.length > 2 ? "…" : ""}`,
      href: "/traders-corner",
    });
  }

  if (f && f.debt.utilization != null && f.debt.utilization > UTILIZATION_WARN) {
    items.push({
      key: "utilization",
      severity: "warning",
      message: `Credit cards are ${Math.round(f.debt.utilization * 100)}% used. Under 30% helps your score`,
      href: "/foundation/debt",
    });
  }

  const cutoff = new Date(Date.parse(input.today + "T12:00:00Z") - STALE_BALANCE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const stale = input.debts.filter((d) => !d.paidOffAt && d.balanceAsOf < cutoff);
  if (stale.length) {
    items.push({
      key: "stale",
      severity: "warning",
      message: `Update ${stale.length} debt balance${stale.length > 1 ? "s" : ""} (last checked over ${STALE_BALANCE_DAYS} days ago)`,
      href: "/foundation/debt",
    });
  }

  const tomorrow = new Date(Date.parse(input.today + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  for (const e of input.events.filter((x) => x.high && (x.date === input.today || x.date === tomorrow)).slice(0, 2)) {
    const when = e.date === input.today ? "today" : "tomorrow";
    const exp = e.forecast ? ` · exp ${e.forecast}` : e.previous ? ` · prev ${e.previous}` : "";
    items.push({ key: `event:${e.date}:${e.label}`, severity: "info", message: `${e.label} ${when} ${e.time} ET${exp}`, href: "/traders-corner/economy" });
  }

  if (f && f.emergencyFund.target > 0 && f.emergencyFund.gap > 0) {
    const months = f.emergencyFund.monthsToGoal;
    items.push({
      key: "emergency",
      severity: "info",
      message: `Emergency fund is ${usd(f.emergencyFund.gap)} short${months != null ? `, about ${months} month${months === 1 ? "" : "s"} at your surplus` : ""}`,
      href: "/foundation/net-worth",
    });
  }

  return items.sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, MAX_ATTENTION_ITEMS);
}
