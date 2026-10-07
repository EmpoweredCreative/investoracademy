"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EditableTable } from "@/components/foundation/EditableTable";
import { FoundationPage, Notice, Section, Tile } from "@/components/foundation/FoundationPage";
import type { BusinessExpense } from "@/components/foundation/useFoundation";
import { addMonths, TAX_RESERVE_RATE } from "@/lib/foundation/calc";
import { BUSINESS_EXPENSE_OPTIONS, fmtMoney, fmtMonth, labelOf } from "@/lib/foundation/labels";

export default function BusinessPage() {
  return (
    <FoundationPage title="Business P&L" subtitle="Revenue minus expenses, three months side by side, with one-time items kept separate.">
      {(data, api) => {
        if (!data.business) {
          return (
            <Notice>
              The business P&amp;L is for business owners. If you own a business, switch your profile to &quot;Business owner&quot; or
              &quot;Both&quot; in <Link href="/settings" className="text-accent underline">Settings</Link>.
            </Notice>
          );
        }
        const { months, pnl, expenses, revenue } = data.business;
        const current = data.today.slice(0, 7);
        const end = months[months.length - 1];
        const shift = (n: number) => {
          const next = addMonths(end + "-01", n).slice(0, 7);
          api.setBusinessEnd(next >= current ? null : next);
        };
        const avg = pnl.average;
        const businessAsset = data.assets.find((a) => a.type === "BUSINESS");
        const monthOptions = months.map((m) => ({ value: m, label: fmtMonth(m) }));

        return (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => shift(-1)} aria-label="Earlier months">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[150px] text-center">
                {fmtMonth(months[0])} – {fmtMonth(end)}
              </span>
              <Button size="sm" variant="secondary" onClick={() => shift(1)} disabled={end >= current} aria-label="Later months">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Tile label="Avg revenue" value={fmtMoney(avg.revenue)} hint="per month" />
              <Tile label="Avg expenses" value={fmtMoney(avg.recurringExpenses)} hint="recurring, per month" />
              <Tile
                label="Avg net income"
                value={fmtMoney(avg.recurringNet)}
                tone={avg.recurringNet != null && avg.recurringNet < 0 ? "text-danger" : "text-success"}
                hint="excluding one-time items"
                emphasis
              />
              <Tile
                label="Tax reserve (est.)"
                value={avg.recurringNet != null ? fmtMoney(Math.max(0, avg.recurringNet) * TAX_RESERVE_RATE) : "—"}
                hint="~25% of net · confirm with your accountant"
              />
              <Tile
                label="Business value (est.)"
                value={fmtMoney(pnl.suggestedValue)}
                hint={
                  pnl.suggestedValue != null ? (
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      onClick={() =>
                        businessAsset
                          ? api.update("assets", businessAsset.id, { value: pnl.suggestedValue, valueIsEstimate: true, asOf: data.today })
                          : api.create("assets", {
                              name: "My business",
                              type: "BUSINESS",
                              value: pnl.suggestedValue,
                              valueIsEstimate: true,
                              asOf: data.today,
                            })
                      }
                    >
                      {businessAsset ? "Update my business asset" : "Add to my net worth"}
                    </button>
                  ) : (
                    "2× annual net profit"
                  )
                }
              />
            </div>

            <Section title="Profit & loss">
              <div className="rounded-2xl border border-border bg-card shadow-card overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted border-b border-border">
                      <th className="text-left font-semibold py-2 px-3" />
                      {months.map((m) => (
                        <th key={m} className="text-right font-semibold py-2 px-3">
                          {fmtMonth(m)}
                        </th>
                      ))}
                      <th className="text-right font-semibold py-2 px-3">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/60">
                      <td className="py-2 px-3 font-semibold">Revenue</td>
                      {months.map((m) => (
                        <td key={m} className="py-1.5 px-2 text-right">
                          <RevenueInput
                            key={`${m}:${revenue.find((r) => r.month === m)?.revenue ?? ""}`}
                            value={revenue.find((r) => r.month === m)?.revenue ?? null}
                            onSave={(v) => api.setRevenue(m, v)}
                          />
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right num font-semibold">{fmtMoney(avg.revenue)}</td>
                    </tr>
                    {pnl.categories.map((c) => (
                      <tr key={c} className="border-b border-border/40">
                        <td className="py-1.5 px-3 pl-6 text-muted">{labelOf(BUSINESS_EXPENSE_OPTIONS, c)}</td>
                        {pnl.columns.map((col) => (
                          <td key={col.month} className="py-1.5 px-3 text-right num">
                            {fmtMoney(col.byCategory[c])}
                          </td>
                        ))}
                        <td className="py-1.5 px-3 text-right num">{fmtMoney(avg.byCategory[c])}</td>
                      </tr>
                    ))}
                    <Row label="Operating expenses" values={pnl.columns.map((c) => c.recurringExpenses)} avg={avg.recurringExpenses} />
                    <Row label="Net income (recurring)" values={pnl.columns.map((c) => c.recurringNet)} avg={avg.recurringNet} strong />
                    <Row label="One-time items" values={pnl.columns.map((c) => -c.oneTimeExpenses)} avg={avg.oneTimeExpenses != null ? -avg.oneTimeExpenses : null} muted />
                    <Row label="Net operating income" values={pnl.columns.map((c) => c.netOperatingIncome)} avg={avg.netOperatingIncome} strong />
                  </tbody>
                </table>
              </div>
              {pnl.oneTimeItems.length > 0 && (
                <Notice>
                  One-time items are kept out of the recurring net, which drives the tax reserve and business value:{" "}
                  {pnl.oneTimeItems.map((e) => `${e.name} (${fmtMoney(e.amount)}, ${fmtMonth(e.month)})`).join("; ")}.
                </Notice>
              )}
            </Section>

            <Section title="Expenses">
              <EditableTable<BusinessExpense>
                rows={expenses}
                columns={[
                  { key: "month", label: "Month", type: "select", options: monthOptions },
                  { key: "name", label: "Expense", type: "text", placeholder: "e.g. Gusto payroll" },
                  { key: "category", label: "Category", type: "select", options: BUSINESS_EXPENSE_OPTIONS },
                  { key: "amount", label: "Amount", type: "money", align: "right" },
                  { key: "oneTime", label: "One-time?", type: "checkbox" },
                ]}
                newRow={() => ({ month: end, category: "SOFTWARE", oneTime: false })}
                onCreate={(v) => api.create("business-expenses", v)}
                onUpdate={(id, v) => api.update("business-expenses", id, v)}
                onDelete={(id) => api.remove("business-expenses", id)}
                addLabel="Add an expense"
                emptyText="Add payroll, contractors, software, insurance, advertising, travel…"
              />
            </Section>
          </>
        );
      }}
    </FoundationPage>
  );
}

function Row({ label, values, avg, strong, muted }: { label: string; values: (number | null)[]; avg: number | null; strong?: boolean; muted?: boolean }) {
  return (
    <tr className={`border-b border-border/60 ${strong ? "bg-background/60" : ""}`}>
      <td className={`py-2 px-3 ${strong ? "font-semibold" : muted ? "text-muted" : ""}`}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`py-2 px-3 text-right num ${strong ? "font-semibold" : muted ? "text-muted" : ""} ${v != null && v < 0 && strong ? "text-danger" : ""}`}>
          {fmtMoney(v)}
        </td>
      ))}
      <td className={`py-2 px-3 text-right num ${strong ? "font-semibold" : muted ? "text-muted" : ""}`}>{fmtMoney(avg)}</td>
    </tr>
  );
}

/** Revenue cell: saves when you leave the field or press Enter. */
function RevenueInput({ value, onSave }: { value: number | null; onSave: (v: number | null) => Promise<void> }) {
  const [text, setText] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);
  const commit = async () => {
    const s = text.replace(/[$,\s]/g, "");
    const next = s === "" ? null : Number(s);
    if (next != null && (!Number.isFinite(next) || next < 0)) return;
    if (next === value) return;
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      inputMode="decimal"
      placeholder="Add"
      disabled={saving}
      aria-label="Revenue"
      className="w-28 px-2 py-1 text-right num bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
    />
  );
}
