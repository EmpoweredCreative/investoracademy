"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { FoundationPage, Tile } from "@/components/foundation/FoundationPage";
import { ToolGrid } from "@/components/sections/SectionHub";
import { FOUNDATION } from "@/lib/sections";
import { fmtMoney, fmtPct } from "@/lib/foundation/labels";
import type { DtiBand } from "@/lib/foundation/calc";

const DTI_LABEL: Record<DtiBand, { text: string; tone: string }> = {
  excellent: { text: "Excellent (under 36%)", tone: "text-success" },
  good: { text: "Approvable for most loans", tone: "" },
  elevated: { text: "Elevated: lenders get cautious", tone: "text-warning" },
  high: { text: "High risk (over 50%)", tone: "text-danger" },
};

export default function FoundationHubPage() {
  return (
    <FoundationPage title="Foundation" subtitle={FOUNDATION.tagline} back={false}>
      {(data) => {
        const s = data.summary;
        const prev = data.history.length > 1 ? data.history[data.history.length - 2] : null;
        const change = prev ? s.netWorth - prev.netWorth : null;
        const steps = [
          { label: "Add your income", done: data.incomes.length > 0, href: "/foundation/budget" },
          { label: "Add your monthly bills", done: data.bills.length > 0, href: "/foundation/budget" },
          { label: "Add your debts, with their interest rates", done: data.debts.length > 0, href: "/foundation/debt", optional: true },
          { label: "Add your savings and other assets", done: data.assets.length > 0 || data.tradingAssets.length > 0, href: "/foundation/net-worth" },
        ];
        const setupDone = steps.filter((x) => !x.optional).every((x) => x.done);
        const dti = s.dti ? DTI_LABEL[s.dti.band] : null;
        const ef = s.emergencyFund;

        return (
          <>
            {!setupDone && (
              <section className="rise-in rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
                <div>
                  <h2 className="font-semibold">Build your financial picture</h2>
                  <p className="text-sm text-muted">
                    A few minutes of entering your numbers gets you net worth, cash flow, and what your debt really costs.
                  </p>
                </div>
                <ol className="space-y-1.5">
                  {steps.map((x) => (
                    <li key={x.label}>
                      <Link href={x.href} className="flex items-center gap-2 text-sm hover:text-accent">
                        {x.done ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4 text-muted" />}
                        <span className={x.done ? "text-muted line-through" : ""}>{x.label}</span>
                        {x.optional && !x.done && <span className="text-[11px] text-muted">(skip if you have none)</span>}
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <Tile
                label="Net worth"
                value={fmtMoney(s.netWorth)}
                tone={s.netWorth < 0 ? "text-danger" : ""}
                hint={change != null ? `${change >= 0 ? "▲" : "▼"} ${fmtMoney(Math.abs(change))} since last month` : "Assets − debts"}
                emphasis
              />
              <Tile
                label="Left over each month"
                value={fmtMoney(s.cashFlow.monthly)}
                tone={s.cashFlow.monthly >= 0 ? "text-success" : "text-danger"}
                hint={
                  s.cashFlow.savingsRate != null
                    ? `${fmtPct(s.cashFlow.savingsRate)} of take-home${s.cashFlow.taxReserve > 0 ? " after tax reserve" : ""}`
                    : "Add income to see this"
                }
              />
              <Tile
                label="Interest to lenders"
                value={`${fmtMoney(s.debt.interestMonthly)}/mo`}
                tone={s.debt.interestMonthly > 0 ? "text-danger" : ""}
                hint={s.debt.interestYearly > 0 ? `${fmtMoney(s.debt.interestYearly)} a year` : "No interest-bearing debt"}
              />
              <Tile
                label="Debt-to-income"
                value={s.dti ? fmtPct(s.dti.value) : "—"}
                tone={dti?.tone}
                hint={dti?.text ?? "Add gross income and debts"}
              />
              <Tile
                label="Emergency fund"
                value={ef.target === 0 ? "—" : ef.gap === 0 ? "Fully funded" : `${fmtMoney(ef.gap)} short`}
                tone={ef.target > 0 && ef.gap === 0 ? "text-success" : ""}
                hint={
                  ef.target === 0
                    ? "Add bills to set a goal"
                    : `Goal ${fmtMoney(ef.target)} (3 months)${ef.gap > 0 && ef.monthsToGoal != null ? ` · ~${ef.monthsToGoal} mo at your surplus` : ""}`
                }
              />
              <Tile
                label="Credit card use"
                value={fmtPct(s.debt.utilization)}
                tone={s.debt.utilization != null && s.debt.utilization > 0.3 ? "text-warning" : ""}
                hint={s.debt.utilization != null ? "Under 30% helps your score" : "Add card limits in Debt"}
              />
            </div>

            <ToolGrid section={FOUNDATION} />
          </>
        );
      }}
    </FoundationPage>
  );
}
