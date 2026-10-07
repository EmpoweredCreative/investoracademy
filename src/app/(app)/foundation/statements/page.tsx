"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FoundationPage, Section } from "@/components/foundation/FoundationPage";
import { BalanceSheet } from "@/components/foundation/Statements";
import { monthly, type Frequency } from "@/lib/foundation/calc";
import { BILL_CATEGORY_OPTIONS, DEBT_TYPE_OPTIONS, INCOME_TYPE_OPTIONS, fmtMoney, fmtMonth, fmtPct, labelOf } from "@/lib/foundation/labels";

export default function StatementsPage() {
  return (
    <FoundationPage title="Statements" subtitle="Your cash flow statement and balance sheet, as of today.">
      {(data) => {
        const s = data.summary;
        const incomes = data.incomes.filter((i) => i.active);
        const debtsById = new Map(data.debts.map((d) => [d.id, d]));
        const ef = s.emergencyFund;
        // Where freed-up cash does the most good, in order.
        const costliest = [...s.debt.items].filter((d) => d.apr != null).sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0))[0];
        const ideas: string[] = [];
        if (s.cashFlow.monthly <= 0) {
          ideas.push("Spending is above take-home pay. Look at the largest bill categories and loan payments first.");
        } else {
          if (ef.gap > 0) ideas.push(`Build the emergency fund: ${fmtMoney(ef.gap)} to go to reach 3 months of expenses (${fmtMoney(ef.target)}).`);
          if (costliest && (costliest.apr ?? 0) >= 8)
            ideas.push(`Pay down ${costliest.lender} at ${costliest.apr}%: every extra dollar there earns a guaranteed ${costliest.apr}%.`);
          if (ideas.length === 0) ideas.push("Emergency fund is covered and no high-rate debt remains. Freed cash can go toward investing.");
        }

        return (
          <>
            <div className="no-print flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4" />
                Print or save as PDF
              </Button>
            </div>

            <Section title={`Cash flow statement · monthly · as of ${new Date(data.today + "T12:00:00").toLocaleDateString()}`}>
              <div className="rounded-2xl border border-border bg-card shadow-card overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <tbody>
                    <Head label="Money in" right="Take-home" />
                    {incomes.length === 0 && <Empty text="No income entered" />}
                    {incomes.map((i) => (
                      <Line
                        key={i.id}
                        label={i.name}
                        sub={`${labelOf(INCOME_TYPE_OPTIONS, i.type)} · ${fmtMoney(monthly(i.amount, i.frequency as Frequency))} gross`}
                        value={monthly(i.netAmount ?? i.amount, i.frequency as Frequency)}
                      />
                    ))}
                    <Total label="Total money in" value={s.income.netMonthly} />

                    <Head label="Money out" />
                    {Object.entries(s.bills.byCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, v]) => (
                        <Line key={cat} label={labelOf(BILL_CATEGORY_OPTIONS, cat)} value={-v} />
                      ))}
                    {s.debt.items.map((d) => (
                      <Line
                        key={d.id}
                        label={`${d.lender} payment`}
                        sub={labelOf(DEBT_TYPE_OPTIONS, debtsById.get(d.id)?.type ?? d.type)}
                        value={-d.payment}
                      />
                    ))}
                    <Total label="Total money out" value={-(s.bills.monthly + s.debt.paymentsMonthly)} />

                    <Total label="Net cash flow" value={s.cashFlow.beforeTaxReserve} strong />
                    {s.hasBusiness && (
                      <>
                        <Line
                          label="Tax reserve (estimate)"
                          sub="~25% of business net income · confirm with your accountant"
                          value={-s.cashFlow.taxReserve}
                        />
                        <Total label="Net cash flow after tax reserve" value={s.cashFlow.monthly} strong />
                      </>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Savings rate" value={fmtPct(s.cashFlow.savingsRate)} />
                <Stat label="Debt-to-income" value={s.dti ? fmtPct(s.dti.value) : "—"} />
                <Stat label="Interest to lenders" value={`${fmtMoney(s.debt.interestMonthly)}/mo`} />
                <Stat label="Debt-free" value={s.debt.debtFreeDate ? fmtMonth(s.debt.debtFreeDate) : "—"} />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted">Where extra cash does the most good</p>
                <ol className="mt-2 space-y-1 text-sm list-decimal pl-5">
                  {ideas.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              </div>
            </Section>

            <Section title="Balance sheet">
              <BalanceSheet data={data} />
            </Section>

            <p className="text-[11px] text-muted">
              Balances marked as estimates assume your regular payments since they were last updated. Business values and tax
              reserves are estimates. This isn&apos;t tax or legal advice.
            </p>
          </>
        );
      }}
    </FoundationPage>
  );
}

function Head({ label, right }: { label: string; right?: string }) {
  return (
    <tr className="bg-background/60 border-y border-border">
      <td className="py-2 px-4 text-[11px] uppercase tracking-[0.12em] font-semibold text-muted">{label}</td>
      <td className="py-2 px-4 text-right text-[11px] uppercase tracking-[0.12em] font-semibold text-muted">{right}</td>
    </tr>
  );
}

function Line({ label, sub, value }: { label: string; sub?: string; value: number }) {
  return (
    <tr className="border-b border-border/40">
      <td className="py-1.5 px-4">
        {label}
        {sub && <span className="block text-[11px] text-muted">{sub}</span>}
      </td>
      <td className="py-1.5 px-4 text-right num">{fmtMoney(value)}</td>
    </tr>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={`border-b border-border ${strong ? "bg-accent/5" : ""}`}>
      <td className={`py-2 px-4 font-semibold ${strong ? "text-base" : ""}`}>{label}</td>
      <td className={`py-2 px-4 text-right num font-semibold ${strong ? "text-base" : ""} ${value < 0 && strong ? "text-danger" : ""}`}>{fmtMoney(value)}</td>
    </tr>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <tr>
      <td colSpan={2} className="py-2 px-4 text-muted">
        {text}
      </td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num font-semibold">{value}</div>
    </div>
  );
}
