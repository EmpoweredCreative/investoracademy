"use client";

import { EditableTable } from "@/components/foundation/EditableTable";
import { FoundationPage, Notice, Section, Tile } from "@/components/foundation/FoundationPage";
import type { Asset } from "@/components/foundation/useFoundation";
import { LineChart } from "@/components/charts/EconCharts";
import { BalanceSheet } from "@/components/foundation/Statements";
import { ASSET_TYPE_OPTIONS, DEBT_TYPE_OPTIONS, fmtMoney, fmtPct, labelOf } from "@/lib/foundation/labels";


export default function NetWorthPage() {
  return (
    <FoundationPage title="Net Worth" subtitle="Everything you own minus everything you owe, tracked month to month.">
      {(data, api) => {
        const s = data.summary;
        const prev = data.history.length > 1 ? data.history[data.history.length - 2] : null;
        const change = prev ? s.netWorth - prev.netWorth : null;
        const activeDebts = data.debts.filter((d) => !d.paidOffAt);
        const debtOptions = [
          { value: "", label: "None" },
          ...activeDebts.map((d) => ({ value: d.id, label: `${d.lender} (${labelOf(DEBT_TYPE_OPTIONS, d.type)})` })),
        ];
        const withDate = (v: Record<string, unknown>) => ({ ...v, asOf: data.today });

        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Tile
                label="Net worth"
                value={fmtMoney(s.netWorth)}
                tone={s.netWorth >= 0 ? "" : "text-danger"}
                hint={change != null ? `${change >= 0 ? "▲" : "▼"} ${fmtMoney(Math.abs(change))} since last month` : "Tracked monthly from here"}
                emphasis
              />
              <Tile label="Assets" value={fmtMoney(s.assets.total)} />
              <Tile label="Liabilities" value={fmtMoney(s.debt.total)} />
              <Tile label="Liquid assets" value={fmtMoney(s.assets.liquid)} hint="Cash and investments" />
              <Tile label="Debt-to-asset" value={fmtPct(s.debtToAsset)} hint="Lower is stronger" />
            </div>

            <Section title="Assets">
              <EditableTable<Asset>
                rows={data.assets}
                columns={[
                  { key: "name", label: "Asset", type: "text", placeholder: "e.g. Ally savings" },
                  { key: "type", label: "Type", type: "select", options: ASSET_TYPE_OPTIONS },
                  { key: "value", label: "Value", type: "money", align: "right" },
                  { key: "valueIsEstimate", label: "Estimate?", type: "checkbox" },
                  {
                    key: "securesDebtId",
                    label: "Loan against it",
                    type: "select",
                    options: debtOptions,
                    optional: true,
                    display: (a) => (a.securesDebtId ? labelOf(debtOptions, a.securesDebtId) : <span className="text-muted">—</span>),
                  },
                ]}
                newRow={() => ({ type: "SAVINGS", valueIsEstimate: false, securesDebtId: null })}
                onCreate={(v) => api.create("assets", withDate(v))}
                onUpdate={(id, v) => api.update("assets", id, withDate(v))}
                onDelete={(id) => api.remove("assets", id)}
                addLabel="Add an asset"
                emptyText="Add checking, savings, retirement accounts, your home, vehicles…"
              />
              {s.hasBusiness && !data.assets.some((a) => a.type === "BUSINESS") && (
                <Notice>
                  Own a business? Add it as an asset. A common starting estimate is 2× its annual net profit, and it&apos;s marked as an
                  estimate until you have a formal valuation.
                </Notice>
              )}
            </Section>

            <Section
              title="Trader's Corner accounts"
              right={
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={data.profile.includeTradingInNetWorth}
                    onChange={(e) => api.setPreferences({ includeTradingInNetWorth: e.target.checked })}
                  />
                  Count in net worth
                </label>
              }
            >
              {data.tradingAssets.length === 0 ? (
                <p className="text-sm text-muted">
                  {data.profile.includeTradingInNetWorth
                    ? "No live investment accounts yet. Simulated accounts aren't counted."
                    : "Not counted. Turn this on to include your investment accounts."}
                </p>
              ) : (
                <ul className="rounded-xl border border-border divide-y divide-border">
                  {data.tradingAssets.map((t) => (
                    <li key={t.id} className="flex justify-between px-3 py-2 text-sm">
                      <span>{t.name}</span>
                      <span className="num">{fmtMoney(t.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Balance sheet">
              <BalanceSheet data={data} />
            </Section>

            <Section title="Net worth over time">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
                {data.history.length < 2 ? (
                  <p className="text-sm text-muted">
                    Your net worth is saved once a month. The trend line appears after your second month.
                  </p>
                ) : (
                  <LineChart
                    points={data.history.map((h) => ({ date: h.month, value: h.netWorth }))}
                    format={(v) => fmtMoney(v)}
                    label="Net worth"
                    height={200}
                  />
                )}
              </div>
            </Section>
          </>
        );
      }}
    </FoundationPage>
  );
}
