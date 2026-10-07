"use client";

import { useState } from "react";
import { CheckCircle2, Pencil, PartyPopper, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DebtForm } from "@/components/foundation/DebtForm";
import { PayoffPlanner } from "@/components/foundation/PayoffPlanner";
import { FoundationPage, Notice, Section, Tile } from "@/components/foundation/FoundationPage";
import type { Debt } from "@/components/foundation/useFoundation";
import type { DebtAnalysis } from "@/lib/foundation/calc";
import { DEBT_TYPE_OPTIONS, fmtMoney, fmtMonth, fmtPct, labelOf } from "@/lib/foundation/labels";

export default function DebtPage() {
  const [form, setForm] = useState<{ debt: Debt | null } | null>(null);
  const [confirm, setConfirm] = useState<{ debt: Debt; action: "paid" | "delete" } | null>(null);
  const [celebrate, setCelebrate] = useState<{ lender: string; payment: number } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <FoundationPage title="Debt" subtitle="Every balance and rate in one place, and what it's costing you in interest.">
      {(data, api) => {
        const s = data.summary;
        const byId = new Map(data.debts.map((d) => [d.id, d]));
        // Costliest first: the debts charging you the most interest each month.
        const items = [...s.debt.items].sort((a, b) => (b.monthlyInterest ?? -1) - (a.monthlyInterest ?? -1));
        const paidOff = data.debts.filter((d) => d.paidOffAt).sort((a, b) => b.paidOffAt!.localeCompare(a.paidOffAt!));
        const stuck = items.filter((d) => d.notPayingDown);

        const act = async () => {
          if (!confirm) return;
          setBusy(true);
          try {
            if (confirm.action === "paid") {
              await api.update("debts", confirm.debt.id, { paidOffAt: new Date().toISOString(), balance: 0 });
              const a = s.debt.items.find((i) => i.id === confirm.debt.id);
              setCelebrate({ lender: confirm.debt.lender, payment: a?.payment ?? confirm.debt.monthlyPayment });
            } else {
              await api.remove("debts", confirm.debt.id);
            }
            setConfirm(null);
          } finally {
            setBusy(false);
          }
        };

        return (
          <>
            {celebrate && (
              <div className="rise-in flex items-center gap-3 rounded-2xl border border-success/30 bg-success/10 px-4 py-3">
                <PartyPopper className="w-6 h-6 text-success shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-semibold">{celebrate.lender} is paid off!</span> That frees up{" "}
                  <span className="font-semibold num">{fmtMoney(celebrate.payment)}</span> a month. Put it toward your next debt to pay
                  that one off faster.
                </div>
                <button type="button" onClick={() => setCelebrate(null)} className="text-xs text-muted hover:text-foreground">
                  Dismiss
                </button>
              </div>
            )}

            {/* Interest banner */}
            <section className="rise-in rounded-2xl border border-border bg-card p-6 shadow-card">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-semibold">Interest you pay lenders</p>
              <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
                <span className="num text-danger">{fmtMoney(s.debt.interestMonthly)}</span>
                <span className="text-muted text-lg font-normal"> a month · </span>
                <span className="num text-danger">{fmtMoney(s.debt.interestYearly)}</span>
                <span className="text-muted text-lg font-normal"> a year</span>
              </p>
              <p className="mt-2 text-sm text-muted">
                That&apos;s money that goes to banks instead of paying down what you owe.
                {s.debt.missingApr > 0 && ` ${s.debt.missingApr} debt${s.debt.missingApr > 1 ? "s are" : " is"} missing an interest rate, so the real number is higher.`}
              </p>
            </section>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Total debt" value={fmtMoney(s.debt.total)} />
              <Tile label="Monthly payments" value={fmtMoney(s.debt.paymentsMonthly)} />
              <Tile
                label="Debt-free"
                value={s.debt.debtFreeDate ? fmtMonth(s.debt.debtFreeDate) : "—"}
                hint={
                  s.debt.items.length === 0
                    ? "No debts yet"
                    : s.debt.debtFreeDate
                      ? "at your current payments"
                      : stuck.length
                        ? "Not at current payments"
                        : "Add missing rates to see this"
                }
              />
              <Tile
                label="Credit card use"
                value={fmtPct(s.debt.utilization)}
                tone={s.debt.utilization != null && s.debt.utilization > 0.3 ? "text-warning" : ""}
                hint={s.debt.utilization != null ? "Under 30% helps your credit score" : "Add card limits to see this"}
              />
            </div>

            {stuck.length > 0 && (
              <Notice tone="warning">
                {stuck.map((d) => d.lender).join(", ")}: the payment doesn&apos;t cover the monthly interest, so the balance never goes
                down. Paying even a little more each month changes that.
              </Notice>
            )}

            <Section
              title="Your debts"
              right={
                <Button size="sm" onClick={() => setForm({ debt: null })}>
                  <Plus className="w-4 h-4" />
                  Add a debt
                </Button>
              }
            >
              {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted">
                  Add your mortgage, car loans, credit cards and any other loans. For each one you&apos;ll see exactly what it costs you
                  in interest.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {items.map((a) => (
                    <DebtCard
                      key={a.id}
                      a={a}
                      debt={byId.get(a.id)!}
                      onEdit={() => setForm({ debt: byId.get(a.id)! })}
                      onPaid={() => setConfirm({ debt: byId.get(a.id)!, action: "paid" })}
                      onDelete={() => setConfirm({ debt: byId.get(a.id)!, action: "delete" })}
                    />
                  ))}
                </div>
              )}
            </Section>

            {items.length > 0 && (
              <Section title="Payoff plan">
                <PayoffPlanner items={s.debt.items} debts={data.debts} today={data.today} />
              </Section>
            )}

            {paidOff.length > 0 && (
              <Section title="Paid off">
                <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
                  {paidOff.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span className="font-medium">{d.lender}</span>
                      <span className="text-muted">{labelOf(DEBT_TYPE_OPTIONS, d.type)}</span>
                      <span className="ml-auto text-xs text-muted">Paid off {new Date(d.paidOffAt!).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {form && (
              <DebtForm
                debt={form.debt}
                today={data.today}
                onClose={() => setForm(null)}
                onSave={(v) => (form.debt ? api.update("debts", form.debt.id, v) : api.create("debts", v))}
              />
            )}
            <ConfirmDialog
              open={confirm != null}
              title={confirm?.action === "paid" ? `Mark ${confirm.debt.lender} as paid off?` : "Delete this debt?"}
              confirmLabel={confirm?.action === "paid" ? "Mark paid off" : "Delete"}
              loading={busy}
              onConfirm={act}
              onCancel={() => setConfirm(null)}
            >
              {confirm?.action === "paid"
                ? "It moves to your paid-off list and drops out of every total."
                : "This removes it completely. If you paid it off, use “Mark paid off” instead to keep the record."}
            </ConfirmDialog>
          </>
        );
      }}
    </FoundationPage>
  );
}

function DebtCard({
  a,
  debt,
  onEdit,
  onPaid,
  onDelete,
}: {
  a: DebtAnalysis;
  debt: Debt;
  onEdit: () => void;
  onPaid: () => void;
  onDelete: () => void;
}) {
  const escrow = (debt.escrowTaxes ?? 0) + (debt.escrowInsurance ?? 0) + (debt.pmi ?? 0);
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{a.lender}</p>
          <p className="text-xs text-muted">{labelOf(DEBT_TYPE_OPTIONS, a.type)}</p>
        </div>
        <div className="text-right">
          <p className="num text-lg font-semibold">{fmtMoney(a.balance)}</p>
          <p className="text-[11px] text-muted">
            {a.balanceEstimated ? `Estimated · verified ${debt.balanceAsOf}` : `as of ${debt.balanceAsOf}`}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Cell label="APR">
          {a.apr == null ? (
            <button type="button" onClick={onEdit} className="text-accent font-medium hover:underline">
              Add rate
            </button>
          ) : (
            <>
              {a.apr}%{a.aprIsEstimate && <span className="ml-1 text-[10px] text-warning">est.</span>}
            </>
          )}
        </Cell>
        <Cell label="Payment">
          {fmtMoney(a.payment)}
          {escrow > 0 && <span className="block text-[10px] text-muted">incl. {fmtMoney(escrow)} escrow</span>}
        </Cell>
        <Cell label="Interest / mo" tone="text-danger">
          {fmtMoney(a.monthlyInterest)}
        </Cell>
        <Cell label="Interest this year" tone="text-danger">
          {fmtMoney(a.yearlyInterest)}
        </Cell>
        <Cell label="Payoff date">{a.notPayingDown ? <span className="text-danger">Never</span> : fmtMonth(a.payoffDate)}</Cell>
        <Cell label="Interest left" tone="text-danger">
          {a.notPayingDown ? "∞" : fmtMoney(a.remainingInterest)}
        </Cell>
      </dl>

      {a.utilization != null && (
        <div>
          <div className="flex justify-between text-[11px] text-muted">
            <span>Credit used</span>
            <span className={a.utilization > 0.3 ? "text-warning" : ""}>{fmtPct(a.utilization)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
            <div
              className={`h-full rounded-full ${a.utilization > 0.3 ? "bg-warning" : "bg-success"}`}
              style={{ width: `${Math.min(100, a.utilization * 100)}%` }}
            />
          </div>
        </div>
      )}

      <footer className="flex items-center gap-1 pt-1">
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
          Update
        </Button>
        <Button size="sm" variant="ghost" onClick={onPaid}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Mark paid off
        </Button>
        <button type="button" onClick={onDelete} className="ml-auto p-1.5 rounded-md text-muted hover:text-danger" aria-label="Delete">
          <Trash2 className="w-4 h-4" />
        </button>
      </footer>
    </article>
  );
}

function Cell({ label, tone = "", children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-background/60 border border-border px-2 py-1.5">
      <dt className="text-[10px] text-muted">{label}</dt>
      <dd className={`num font-semibold mt-0.5 ${tone}`}>{children}</dd>
    </div>
  );
}
