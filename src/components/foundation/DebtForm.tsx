"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TYPICAL_APR, type DebtType } from "@/lib/foundation/calc";
import { DEBT_TYPE_OPTIONS } from "@/lib/foundation/labels";
import type { Debt } from "./useFoundation";

const inputCls =
  "w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50";

type Form = Record<string, string | boolean>;

const blank = (today: string): Form => ({
  lender: "",
  type: "CREDIT_CARD",
  balance: "",
  balanceAsOf: today,
  monthlyPayment: "",
  apr: "",
  aprIsEstimate: false,
  creditLimit: "",
  escrowTaxes: "",
  escrowInsurance: "",
  pmi: "",
});

const fromDebt = (d: Debt): Form => ({
  lender: d.lender,
  type: d.type,
  balance: String(d.balance),
  balanceAsOf: d.balanceAsOf,
  monthlyPayment: String(d.monthlyPayment),
  apr: d.apr != null ? String(d.apr) : "",
  aprIsEstimate: d.aprIsEstimate,
  creditLimit: d.creditLimit != null ? String(d.creditLimit) : "",
  escrowTaxes: d.escrowTaxes != null ? String(d.escrowTaxes) : "",
  escrowInsurance: d.escrowInsurance != null ? String(d.escrowInsurance) : "",
  pmi: d.pmi != null ? String(d.pmi) : "",
});

const toNum = (v: string | boolean) => {
  const s = String(v).replace(/[$,%\s]/g, "");
  return s === "" ? null : Number(s);
};

/** Add or edit a debt. Always asks for the interest rate. */
export function DebtForm({
  debt,
  today,
  onSave,
  onClose,
}: {
  debt: Debt | null;
  today: string;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState<Form>(() => (debt ? fromDebt(debt) : blank(today)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const type = f.type as DebtType;
  const isMortgage = type === "MORTGAGE";
  const isCard = type === "CREDIT_CARD";

  const estimateApr = (on: boolean) => {
    setF((p) => ({ ...p, aprIsEstimate: on, apr: on ? String(TYPICAL_APR[p.type as DebtType]) : p.apr }));
  };

  const save = async () => {
    const balance = toNum(f.balance);
    const payment = toNum(f.monthlyPayment);
    const apr = toNum(f.apr);
    if (!String(f.lender).trim()) return setError("Who is this debt owed to?");
    if (balance == null || !Number.isFinite(balance)) return setError("Enter the current balance.");
    if (payment == null || !Number.isFinite(payment)) return setError("Enter the monthly payment.");
    if (apr == null) return setError("Enter the interest rate (APR), or check “I'm not sure” to use a typical rate.");
    setSaving(true);
    setError(null);
    try {
      await onSave({
        lender: String(f.lender).trim(),
        type,
        balance,
        balanceAsOf: f.balanceAsOf,
        monthlyPayment: payment,
        apr,
        aprIsEstimate: Boolean(f.aprIsEstimate),
        creditLimit: isCard ? toNum(f.creditLimit) : null,
        escrowTaxes: isMortgage ? toNum(f.escrowTaxes) : null,
        escrowInsurance: isMortgage ? toNum(f.escrowInsurance) : null,
        pmi: isMortgage ? toNum(f.pmi) : null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={debt ? "Edit debt" : "Add a debt"}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative mx-auto my-10 w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{debt ? "Edit debt" : "Add a debt"}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Owed to" className="col-span-2 sm:col-span-1">
            <input className={inputCls} value={String(f.lender)} onChange={(e) => set("lender", e.target.value)} placeholder="e.g. Chase Sapphire" />
          </Field>
          <Field label="Type" className="col-span-2 sm:col-span-1">
            <select
              className={inputCls}
              value={type}
              onChange={(e) => {
                set("type", e.target.value);
                if (f.aprIsEstimate) set("apr", String(TYPICAL_APR[e.target.value as DebtType]));
              }}
            >
              {DEBT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Current balance">
            <input className={inputCls} inputMode="decimal" value={String(f.balance)} onChange={(e) => set("balance", e.target.value)} placeholder="$" />
          </Field>
          <Field label="Balance as of">
            <input className={inputCls} type="date" value={String(f.balanceAsOf)} max={today} onChange={(e) => set("balanceAsOf", e.target.value)} />
          </Field>
          <Field label={isMortgage ? "Principal & interest / mo" : isCard ? "Monthly payment (what you usually pay)" : "Monthly payment"}>
            <input
              className={inputCls}
              inputMode="decimal"
              value={String(f.monthlyPayment)}
              onChange={(e) => set("monthlyPayment", e.target.value)}
              placeholder="$"
            />
          </Field>
          <Field label="Interest rate (APR %)">
            <input
              className={inputCls}
              inputMode="decimal"
              value={String(f.apr)}
              disabled={Boolean(f.aprIsEstimate)}
              onChange={(e) => set("apr", e.target.value)}
              placeholder="e.g. 22.99"
            />
          </Field>
          <label className="col-span-2 flex items-start gap-2 text-xs text-muted">
            <input type="checkbox" className="mt-0.5" checked={Boolean(f.aprIsEstimate)} onChange={(e) => estimateApr(e.target.checked)} />
            <span>
              I&apos;m not sure. Use a typical {DEBT_TYPE_OPTIONS.find((o) => o.value === type)?.label.toLowerCase()} rate (
              {TYPICAL_APR[type]}%) for now. It&apos;s marked as an estimate; your statement shows the real APR.
            </span>
          </label>

          {isCard && (
            <Field label="Credit limit" className="col-span-2">
              <input
                className={inputCls}
                inputMode="decimal"
                value={String(f.creditLimit)}
                onChange={(e) => set("creditLimit", e.target.value)}
                placeholder="Optional. Used for credit utilization"
              />
            </Field>
          )}

          {isMortgage && (
            <>
              <p className="col-span-2 text-xs text-muted">
                Escrow (monthly). These make up your full payment (PITI), which lenders use for debt-to-income.
              </p>
              <Field label="Property taxes / mo">
                <input className={inputCls} inputMode="decimal" value={String(f.escrowTaxes)} onChange={(e) => set("escrowTaxes", e.target.value)} placeholder="$" />
              </Field>
              <Field label="Home insurance / mo">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={String(f.escrowInsurance)}
                  onChange={(e) => set("escrowInsurance", e.target.value)}
                  placeholder="$"
                />
              </Field>
              <Field label="PMI / mo">
                <input className={inputCls} inputMode="decimal" value={String(f.pmi)} onChange={(e) => set("pmi", e.target.value)} placeholder="$ (if any)" />
              </Field>
            </>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {debt ? "Save changes" : "Add debt"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
