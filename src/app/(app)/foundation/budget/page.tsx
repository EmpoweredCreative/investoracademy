"use client";

import Link from "next/link";
import { EditableTable } from "@/components/foundation/EditableTable";
import { FoundationPage, Notice, Section, Tile } from "@/components/foundation/FoundationPage";
import type { Bill, Income } from "@/components/foundation/useFoundation";
import {
  BILL_CATEGORY_OPTIONS,
  FREQUENCY_OPTIONS,
  INCOME_TYPE_OPTIONS,
  fmtMoney,
  fmtPct,
  labelOf,
} from "@/lib/foundation/labels";
import { monthly, type Frequency } from "@/lib/foundation/calc";

export default function BudgetPage() {
  return (
    <FoundationPage title="Monthly Budget" subtitle="What comes in, what goes out, and what's left over each month.">
      {(data, api) => {
        const s = data.summary;
        const incomeTypes = INCOME_TYPE_OPTIONS.filter((o) => !o.business || s.hasBusiness);
        const left = s.cashFlow.monthly;

        // "Where it goes", as shares of take-home pay.
        const outflows = [
          ...Object.entries(s.bills.byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => ({ label: labelOf(BILL_CATEGORY_OPTIONS, k), value: v })),
          ...(s.debt.paymentsMonthly > 0 ? [{ label: "Loan & card payments", value: s.debt.paymentsMonthly }] : []),
          ...(s.cashFlow.taxReserve > 0 ? [{ label: "Tax reserve (est.)", value: s.cashFlow.taxReserve }] : []),
        ];

        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Tile label="Take-home" value={fmtMoney(s.income.netMonthly)} hint="per month" />
              <Tile label="Bills" value={fmtMoney(s.bills.monthly)} hint="per month" />
              <Tile
                label="Loan payments"
                value={fmtMoney(s.debt.paymentsMonthly)}
                hint={<Link href="/foundation/debt" className="text-accent hover:underline">From your debts</Link>}
              />
              {s.hasBusiness ? (
                <Tile label="Tax reserve" value={fmtMoney(s.cashFlow.taxReserve)} hint="estimate · see note below" />
              ) : (
                <Tile label="Savings rate" value={fmtPct(s.cashFlow.savingsRate)} hint="of take-home" />
              )}
              <Tile
                label="Left over"
                value={fmtMoney(left)}
                tone={left >= 0 ? "text-success" : "text-danger"}
                hint={left >= 0 ? "per month" : "You're spending more than you bring home"}
                emphasis
              />
            </div>

            {s.income.missingTakeHome && (
              <Notice>
                Some income only has a gross amount, so it&apos;s counted at gross. Add the take-home amount from your pay stub for an
                accurate &quot;left over&quot; number.
              </Notice>
            )}
            {s.hasBusiness && (
              <Notice>
                The tax reserve is an estimate: about 25% of{" "}
                {s.cashFlow.taxReserveBasis === "pnl" ? (
                  "your business's average net income from the P&L"
                ) : (
                  <>
                    owner draws and distributions. Enter your{" "}
                    <Link href="/foundation/business" className="text-accent underline">
                      business P&amp;L
                    </Link>{" "}
                    to base it on actual profit
                  </>
                )}
                . Confirm the right amount with your accountant.
              </Notice>
            )}

            <Section title="Income">
              <EditableTable<Income>
                rows={data.incomes}
                columns={[
                  { key: "name", label: "Source", type: "text", placeholder: "e.g. Paycheck" },
                  { key: "type", label: "Type", type: "select", options: incomeTypes },
                  { key: "amount", label: "Gross", type: "money", align: "right", hint: "Before taxes, per paycheck" },
                  {
                    key: "netAmount",
                    label: "Take-home",
                    type: "money",
                    align: "right",
                    optional: true,
                    hint: "What hits your bank",
                  },
                  { key: "frequency", label: "How often", type: "select", options: FREQUENCY_OPTIONS },
                ]}
                newRow={() => ({ type: s.hasBusiness && data.profile.type === "BUSINESS_OWNER" ? "OWNER_DRAW" : "SALARY", frequency: "BIWEEKLY" })}
                onCreate={(v) => api.create("income", v)}
                onUpdate={(id, v) => api.update("income", id, v)}
                onDelete={(id) => api.remove("income", id)}
                addLabel="Add income"
                emptyText="Add your paycheck, owner draws or other income."
                footer={
                  <TotalRow
                    colSpan={6}
                    label="Monthly"
                    value={`${fmtMoney(s.income.grossMonthly)} gross · ${fmtMoney(s.income.netMonthly)} take-home`}
                  />
                }
              />
            </Section>

            <Section title="Bills" right={<span className="text-xs text-muted">Loan and credit card payments go in Debt</span>}>
              <EditableTable<Bill>
                rows={data.bills}
                columns={[
                  { key: "name", label: "Bill", type: "text", placeholder: "e.g. Electric" },
                  { key: "category", label: "Category", type: "select", options: BILL_CATEGORY_OPTIONS },
                  {
                    key: "amount",
                    label: "Amount",
                    type: "money",
                    align: "right",
                    display: (b) => (
                      <>
                        {fmtMoney(b.amount, 2)}
                        {b.frequency !== "MONTHLY" && (
                          <span className="block text-[10px] text-muted">{fmtMoney(monthly(b.amount, b.frequency as Frequency))}/mo</span>
                        )}
                      </>
                    ),
                  },
                  { key: "frequency", label: "How often", type: "select", options: FREQUENCY_OPTIONS },
                  { key: "dueDay", label: "Due day", type: "number", optional: true, placeholder: "1–31" },
                  { key: "autopay", label: "Autopay", type: "checkbox" },
                ]}
                newRow={() => ({ category: "UTILITIES", frequency: "MONTHLY", autopay: false })}
                onCreate={(v) => api.create("bills", v)}
                onUpdate={(id, v) => api.update("bills", id, v)}
                onDelete={(id) => api.remove("bills", id)}
                addLabel="Add a bill"
                emptyText="Add rent, utilities, insurance, phone, subscriptions, groceries…"
                footer={<TotalRow colSpan={7} label="Monthly" value={fmtMoney(s.bills.monthly)} />}
              />
            </Section>

            {s.income.netMonthly > 0 && outflows.length > 0 && (
              <Section title="Where your take-home goes">
                <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-2">
                  {[...outflows, { label: left >= 0 ? "Left over" : "Shortfall", value: left, leftover: true }].map((o) => {
                    const pct = Math.min(1, Math.abs(o.value) / s.income.netMonthly);
                    const isLeft = "leftover" in o;
                    return (
                      <div key={o.label} className="grid grid-cols-[minmax(0,160px)_1fr_auto] items-center gap-3 text-sm">
                        <span className={`truncate ${isLeft ? "font-semibold" : ""}`}>{o.label}</span>
                        <span className="h-2.5 rounded-full bg-border/60 overflow-hidden">
                          <span
                            className={`block h-full rounded-full ${isLeft ? (o.value >= 0 ? "bg-success" : "bg-danger") : "bg-accent"}`}
                            style={{ width: `${pct * 100}%` }}
                          />
                        </span>
                        <span className="num text-right w-[150px]">
                          {fmtMoney(o.value)} <span className="text-xs text-muted">· {fmtPct(o.value / s.income.netMonthly)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
          </>
        );
      }}
    </FoundationPage>
  );
}

function TotalRow({ colSpan, label, value }: { colSpan: number; label: string; value: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-2 px-2 text-right text-sm">
        <span className="text-muted mr-2">{label}</span>
        <span className="num font-semibold">{value}</span>
      </td>
    </tr>
  );
}
