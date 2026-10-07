"use client";

import { fmtMoney, labelOf, ASSET_TYPE_OPTIONS, DEBT_TYPE_OPTIONS } from "@/lib/foundation/labels";
import { Tile } from "./FoundationPage";
import type { FoundationData } from "./useFoundation";

const LIQUIDITY: Record<string, string> = {
  CHECKING: "Liquid",
  SAVINGS: "Liquid",
  INVESTMENT: "Liquid",
  RETIREMENT: "Semi-liquid (penalties)",
  HOME: "Illiquid",
  VEHICLE: "Illiquid",
  BUSINESS: "Illiquid",
  OTHER: "Illiquid",
};

function groupSum<T>(items: T[], key: (t: T) => string, value: (t: T) => number): [string, number][] {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + value(i));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Assets and liabilities by category, net worth, and equity in secured assets. */
export function BalanceSheet({ data }: { data: FoundationData }) {
  const s = data.summary;
  const allAssets = [
    ...data.assets.map((a) => ({ type: a.type, value: a.value })),
    ...data.tradingAssets.map((t) => ({ type: "INVESTMENT", value: t.value })),
  ];
  const assetGroups = groupSum(allAssets, (a) => a.type, (a) => a.value);
  const debtGroups = groupSum(s.debt.items, (d) => d.type, (d) => d.balance);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SheetColumn
          title="Assets"
          rows={assetGroups.map(([type, value]) => ({ label: labelOf(ASSET_TYPE_OPTIONS, type), sub: LIQUIDITY[type], value }))}
          total={s.assets.total}
        />
        <SheetColumn
          title="Liabilities"
          rows={debtGroups.map(([type, value]) => ({ label: labelOf(DEBT_TYPE_OPTIONS, type), value }))}
          total={s.debt.total}
        />
      </div>
      <div className="rounded-2xl border border-accent/40 bg-card px-4 py-3 shadow-card flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Net worth (assets − liabilities)</span>
        <span className={`num text-xl font-semibold ${s.netWorth < 0 ? "text-danger" : ""}`}>{fmtMoney(s.netWorth)}</span>
      </div>
      {s.assets.equity.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {s.assets.equity.map((e) => (
            <Tile
              key={e.assetId}
              label={`${e.name} equity`}
              value={fmtMoney(e.equity)}
              tone={e.equity < 0 ? "text-danger" : "text-success"}
              hint={`${fmtMoney(e.value)} value − ${fmtMoney(e.owed)} owed`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SheetColumn({ title, rows, total }: { title: string; rows: { label: string; sub?: string; value: number }[]; total: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border text-[11px] uppercase tracking-[0.12em] font-semibold text-muted">{title}</div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">None yet</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>
                {r.label}
                {r.sub && <span className="block text-[11px] text-muted">{r.sub}</span>}
              </span>
              <span className="num">{fmtMoney(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between px-4 py-2.5 border-t border-border font-semibold text-sm">
        <span>Total {title.toLowerCase()}</span>
        <span className="num">{fmtMoney(total)}</span>
      </div>
    </div>
  );
}
