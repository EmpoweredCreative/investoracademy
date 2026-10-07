"use client";

import { useMemo, useState } from "react";
import { ArrowDown, Snowflake, TrendingDown } from "lucide-react";
import { CompareChart, CompareLegend } from "@/components/charts/EconCharts";
import { addMonths, simulatePayoff, type DebtAnalysis, type PayoffDebt, type PayoffStrategy } from "@/lib/foundation/calc";
import { fmtMoney, fmtMonth } from "@/lib/foundation/labels";
import type { Debt } from "./useFoundation";

const STRATEGIES: { value: Exclude<PayoffStrategy, "custom">; label: string; icon: typeof Snowflake; blurb: string }[] = [
  {
    value: "snowball",
    label: "Snowball",
    icon: Snowflake,
    blurb: "Smallest balance first. Quick wins keep you motivated (Dave Ramsey's method).",
  },
  {
    value: "avalanche",
    label: "Avalanche",
    icon: TrendingDown,
    blurb: "Highest interest rate first. Pays the least interest overall.",
  },
];

/**
 * Payoff plan: every debt gets its minimum; the extra amount and each paid-off
 * debt's payment roll onto the next debt in line.
 */
export function PayoffPlanner({ items, debts, today }: { items: DebtAnalysis[]; debts: Debt[]; today: string }) {
  const [strategy, setStrategy] = useState<Exclude<PayoffStrategy, "custom">>("snowball");
  const [extraText, setExtraText] = useState("100");
  const hasMortgage = items.some((d) => d.type === "MORTGAGE");
  const [includeMortgage, setIncludeMortgage] = useState(false);
  const extra = Math.max(0, Number(extraText.replace(/[$,]/g, "")) || 0);

  const byId = useMemo(() => new Map(debts.map((d) => [d.id, d])), [debts]);
  const eligible: PayoffDebt[] = items
    .filter((d) => d.apr != null && d.balance > 0 && (includeMortgage || d.type !== "MORTGAGE"))
    // Principal & interest only: escrow doesn't pay down the balance.
    .map((d) => ({ id: d.id, lender: d.lender, balance: d.balance, apr: d.apr!, payment: byId.get(d.id)?.monthlyPayment ?? d.payment }));
  const skipped = items.filter((d) => d.apr == null && d.balance > 0);

  const results = useMemo(() => {
    const opts = { today, extra };
    return {
      minimums: simulatePayoff(eligible, { ...opts, extra: 0, strategy: "avalanche", rollover: false }),
      snowball: simulatePayoff(eligible, { ...opts, strategy: "snowball" }),
      avalanche: simulatePayoff(eligible, { ...opts, strategy: "avalanche" }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(eligible), extra, today]);

  if (eligible.length === 0) {
    return (
      <p className="text-sm text-muted">
        Add debts with their interest rates to build a payoff plan.
        {hasMortgage && " (Mortgages are left out by default.)"}
      </p>
    );
  }

  const plan = results[strategy];
  const min = results.minimums;
  const saved = min.totalInterest != null && plan.totalInterest != null ? min.totalInterest - plan.totalInterest : null;
  const monthsSaved = min.months != null && plan.months != null ? min.months - plan.months : null;
  // Show until both lines reach zero (or two years past your plan if minimums never do), capped at 30 years.
  const horizon = Math.min(360, Math.max(plan.months ?? 360, min.months ?? (plan.months ?? 336) + 24));
  const cut = (xs: number[]) => xs.slice(0, horizon + 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="inline-flex rounded-xl border border-border p-1 gap-1" role="radiogroup" aria-label="Payoff strategy">
          {STRATEGIES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={strategy === s.value}
              onClick={() => setStrategy(s.value)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                strategy === s.value ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-xs text-muted">Extra toward debt each month</span>
          <input
            value={extraText}
            onChange={(e) => setExtraText(e.target.value)}
            inputMode="decimal"
            className="mt-1 block w-36 px-3 py-1.5 bg-background border border-border rounded-lg text-sm num focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </label>
        {hasMortgage && (
          <label className="flex items-center gap-2 text-sm pb-1.5">
            <input type="checkbox" checked={includeMortgage} onChange={(e) => setIncludeMortgage(e.target.checked)} />
            Include mortgage
          </label>
        )}
      </div>
      <p className="text-xs text-muted">{STRATEGIES.find((s) => s.value === strategy)!.blurb}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Outcome
          title="Minimums only"
          sub="No extra, nothing rolled over"
          date={min.debtFreeDate}
          interest={min.totalInterest}
        />
        <Outcome
          title={`${STRATEGIES.find((s) => s.value === strategy)!.label} + ${fmtMoney(extra)}/mo`}
          sub="Your plan"
          date={plan.debtFreeDate}
          interest={plan.totalInterest}
          highlight
        />
        <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">You save</p>
          <p className="num mt-1.5 text-xl font-semibold text-success">{saved != null ? fmtMoney(saved) : "—"}</p>
          <p className="mt-1 text-xs text-muted">
            {monthsSaved != null
              ? `and are debt-free ${monthsSaved} month${monthsSaved === 1 ? "" : "s"} sooner`
              : min.months == null && plan.months != null
                ? "Minimums alone never pay these off; this plan does"
                : "Increase the extra amount to see savings"}
          </p>
        </div>
      </div>

      {strategy === "snowball" &&
        results.avalanche.totalInterest != null &&
        plan.totalInterest != null &&
        plan.totalInterest - results.avalanche.totalInterest >= 1 && (
        <p className="text-xs text-muted">
          Avalanche would cost {fmtMoney(plan.totalInterest - results.avalanche.totalInterest)} less in interest with the same
          payments. Snowball trades that for faster early wins.
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-2">
        <CompareLegend
          series={[
            { label: "Your plan", color: "var(--series-1)" },
            { label: "Minimums only", color: "var(--series-2)", dash: "6 4" },
          ]}
        />
        <CompareChart
          label="Total debt over time"
          series={[
            { label: "Your plan", values: cut(plan.timeline), color: "var(--series-1)" },
            { label: "Minimums only", values: cut(min.timeline), color: "var(--series-2)", dash: "6 4" },
          ]}
          xLabel={(i) => fmtMonth(addMonths(today, i))}
          format={(v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : fmtMoney(v))}
        />
      </div>

      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-2">Payoff order</h3>
        <ol className="rounded-2xl border border-border bg-card divide-y divide-border">
          {plan.order.map((o, i) => {
            // Next debt's own minimum + every paid-off debt's payment + the extra.
            const next = plan.order[i + 1];
            const rolled = next ? next.freedPayment + plan.order.slice(0, i + 1).reduce((s, x) => s + x.freedPayment, 0) + extra : 0;
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="grid place-items-center w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-semibold">{i + 1}</span>
                <span className="font-medium">{o.lender}</span>
                <span className="text-muted">paid off {o.date ? fmtMonth(o.date) : "—"}</span>
                <span className="ml-auto text-xs text-muted num">{fmtMoney(o.interest)} interest</span>
                {i < plan.order.length - 1 && (
                  <span className="w-full pl-9 text-xs text-muted inline-flex items-center gap-1">
                    <ArrowDown className="w-3 h-3" />
                    then {fmtMoney(rolled)}/mo goes to {plan.order[i + 1].lender}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {skipped.length > 0 && (
        <p className="text-xs text-muted">Not included (no interest rate yet): {skipped.map((d) => d.lender).join(", ")}.</p>
      )}
    </div>
  );
}

function Outcome({
  title,
  sub,
  date,
  interest,
  highlight,
}: {
  title: string;
  sub: string;
  date: string | null;
  interest: number | null;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-card px-4 py-3 shadow-card ${highlight ? "border-accent/40" : "border-border"}`}>
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">{title}</p>
      <p className="num mt-1.5 text-xl font-semibold">{date ? fmtMonth(date) : "Never"}</p>
      <p className="mt-1 text-xs text-muted">
        {sub} · {interest != null ? `${fmtMoney(interest)} interest` : "interest keeps growing"}
      </p>
    </div>
  );
}
