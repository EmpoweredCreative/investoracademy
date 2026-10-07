"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { FoundationPage, Notice, Section } from "@/components/foundation/FoundationPage";
import { consolidate, type PayoffDebt } from "@/lib/foundation/calc";
import { DEBT_TYPE_OPTIONS, fmtMoney, labelOf } from "@/lib/foundation/labels";

const TERMS = [24, 36, 48, 60, 84];
/** Debts people usually consolidate; mortgages and HELOCs are left unchecked by default. */
const DEFAULT_TYPES = ["CREDIT_CARD", "PERSONAL", "MEDICAL", "OTHER"];

const inputCls =
  "mt-1 block w-full px-3 py-2 bg-background border border-border rounded-lg text-sm num focus:outline-none focus:ring-2 focus:ring-accent/50";

export default function ConsolidationPage() {
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [apr, setApr] = useState("11");
  const [term, setTerm] = useState(36);
  const [feePct, setFeePct] = useState("3");

  return (
    <FoundationPage title="Debt Consolidation" subtitle="Would rolling some debts into one new loan actually save you money?">
      {(data) => {
        const eligible = data.summary.debt.items.filter((d) => d.apr != null && d.balance > 0);
        const selected = picked ?? new Set(eligible.filter((d) => DEFAULT_TYPES.includes(d.type)).map((d) => d.id));
        const toggle = (id: string) => {
          const next = new Set(selected);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setPicked(next);
        };
        const byId = new Map(data.debts.map((d) => [d.id, d]));
        const chosen: PayoffDebt[] = eligible
          .filter((d) => selected.has(d.id))
          .map((d) => ({ id: d.id, lender: d.lender, balance: d.balance, apr: d.apr!, payment: byId.get(d.id)?.monthlyPayment ?? d.payment }));
        const balance = chosen.reduce((s, d) => s + d.balance, 0);
        const fee = Math.round(balance * (Math.max(0, Number(feePct) || 0) / 100));
        const loanApr = Math.max(0, Number(apr) || 0);
        const r = chosen.length ? consolidate(chosen, { apr: loanApr, months: term, fee }) : null;
        const saves = r?.savings != null && r.savings > 0;

        if (eligible.length === 0) {
          return (
            <Notice>
              Add your debts with their interest rates on the <Link href="/foundation/debt" className="text-accent underline">Debt</Link>{" "}
              page first.
            </Notice>
          );
        }

        return (
          <>
            <Section title="1. Pick the debts to roll in">
              <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
                {eligible.map((d) => (
                  <li key={d.id}>
                    <label className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-card-hover">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                      <span className="font-medium">{d.lender}</span>
                      <span className="text-muted text-xs">{labelOf(DEBT_TYPE_OPTIONS, d.type)}</span>
                      <span className="ml-auto num">{fmtMoney(d.balance)}</span>
                      <span className="num text-muted w-16 text-right">{d.apr}%</span>
                    </label>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="2. The loan you're offered">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                <label className="block">
                  <span className="text-xs text-muted">Interest rate (APR %)</span>
                  <input className={inputCls} value={apr} onChange={(e) => setApr(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="text-xs text-muted">Term</span>
                  <select className={inputCls} value={term} onChange={(e) => setTerm(Number(e.target.value))}>
                    {TERMS.map((t) => (
                      <option key={t} value={t}>
                        {t} months ({t / 12} yr)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-muted">Origination fee (%)</span>
                  <input className={inputCls} value={feePct} onChange={(e) => setFeePct(e.target.value)} inputMode="decimal" />
                </label>
              </div>
            </Section>

            {r && (
              <Section title="3. The verdict">
                <div
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
                    saves ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"
                  }`}
                >
                  {saves ? <CheckCircle2 className="w-6 h-6 text-success shrink-0" /> : <XCircle className="w-6 h-6 text-danger shrink-0" />}
                  <div className="text-sm">
                    {r.savings == null ? (
                      <p className="font-semibold">
                        Your current payments never pay these off, so consolidating at {loanApr}% would end the debt in {term} months.
                      </p>
                    ) : saves ? (
                      <p className="font-semibold">Saves you {fmtMoney(r.savings)} in interest and fees.</p>
                    ) : (
                      <p className="font-semibold">Costs you {fmtMoney(-r.savings)} more than keeping your current debts.</p>
                    )}
                    <p className="text-muted mt-0.5">
                      Monthly payment {r.monthlyPaymentChange <= 0 ? "drops" : "rises"} by {fmtMoney(Math.abs(r.monthlyPaymentChange))}
                      {r.breakEvenMonth != null && r.loan.fee > 0 && ` · the fee pays for itself by month ${r.breakEvenMonth}`}.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Compare
                    title="Keep current debts"
                    rows={[
                      ["Monthly payments", fmtMoney(r.current.payment)],
                      ["Paid off in", r.current.months != null ? `${r.current.months} months` : "Never at these payments"],
                      ["Interest left to pay", r.current.totalInterest != null ? fmtMoney(r.current.totalInterest) : "Keeps growing"],
                    ]}
                  />
                  <Compare
                    title={`Consolidation loan at ${loanApr}%`}
                    rows={[
                      ["Monthly payment", fmtMoney(r.loan.payment)],
                      ["Paid off in", `${r.loan.months} months`],
                      ["Interest", fmtMoney(r.loan.totalInterest)],
                      ["Fee (added to the loan)", fmtMoney(r.loan.fee)],
                    ]}
                    highlight
                  />
                </div>

                {r.monthlyPaymentChange < 0 && r.savings != null && r.savings < 0 && (
                  <Notice tone="warning">
                    A lower monthly payment can still cost more overall when the term is longer. Try a shorter term.
                  </Notice>
                )}
                {chosen.some((d) => byId.get(d.id)?.type === "CREDIT_CARD") && (
                  <Notice>
                    This only works if the cards stay paid off. Running the balances back up after consolidating leaves you with both
                    the new loan and the cards.
                  </Notice>
                )}
              </Section>
            )}
          </>
        );
      }}
    </FoundationPage>
  );
}

function Compare({ title, rows, highlight }: { title: string; rows: [string, string][]; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-card shadow-card overflow-hidden ${highlight ? "border-accent/40" : "border-border"}`}>
      <div className="px-4 py-2.5 border-b border-border text-sm font-semibold">{title}</div>
      <dl className="divide-y divide-border/60">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between px-4 py-2 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
