"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { CompanyFinancials } from "@/lib/research/company";
import type { AnnualFacts } from "@/lib/sec/xbrl";

type Row = {
  label: string;
  value: (y: AnnualFacts, prev?: AnnualFacts) => number | null | undefined;
  fmt: "money" | "pct" | "eps" | "shares";
  hint?: string;
};

const growth = (cur?: number, prev?: number) => (cur != null && prev ? ((cur - prev) / Math.abs(prev)) * 100 : null);

const ROWS: Row[] = [
  { label: "Revenue", value: (y) => y.revenue, fmt: "money" },
  { label: "Revenue growth", value: (y, p) => growth(y.revenue, p?.revenue), fmt: "pct" },
  { label: "Gross margin", value: (y) => y.grossMargin, fmt: "pct" },
  { label: "Operating margin", value: (y) => y.operatingMargin, fmt: "pct" },
  { label: "Net margin", value: (y) => y.netMargin, fmt: "pct" },
  { label: "Net income", value: (y) => y.netIncome, fmt: "money" },
  { label: "Diluted EPS", value: (y) => y.dilutedEps, fmt: "eps" },
  { label: "Free cash flow", value: (y) => y.freeCashFlow, fmt: "money", hint: "Operating cash flow − capex" },
  { label: "Return on equity", value: (y) => y.roe, fmt: "pct" },
  { label: "Return on invested capital", value: (y) => y.roic, fmt: "pct", hint: "After-tax operating income ÷ (equity + debt − cash)" },
  { label: "Total debt", value: (y) => y.totalDebt, fmt: "money" },
  { label: "Cash", value: (y) => y.cash, fmt: "money" },
  { label: "Buybacks", value: (y) => y.buybacks, fmt: "money" },
  { label: "Dividends", value: (y) => y.dividends, fmt: "money" },
  { label: "Diluted shares", value: (y) => y.dilutedShares, fmt: "shares" },
  { label: "Share count change", value: (y, p) => growth(y.dilutedShares, p?.dilutedShares), fmt: "pct", hint: "Negative = buybacks shrinking the share count" },
];

function format(v: number | null | undefined, fmt: Row["fmt"]) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (fmt === "pct") return `${v.toFixed(1)}%`;
  if (fmt === "eps") return v.toFixed(2);
  const abs = Math.abs(v);
  const unit = abs >= 1e12 ? [1e12, "T"] : abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1, ""];
  return `${(v / (unit[0] as number)).toFixed(abs >= 1e11 || fmt === "shares" ? 2 : 2)}${unit[1]}`;
}

function Bars({ label, values, years, fmt, color }: { label: string; values: (number | null | undefined)[]; years: number[]; fmt: Row["fmt"]; color: string }) {
  const nums = values.map((v) => (v == null || !Number.isFinite(v) ? null : v));
  const max = Math.max(...nums.map((v) => Math.abs(v ?? 0)), 1e-9);
  const last = nums.filter((v) => v != null).at(-1);
  return (
    <div className="bg-card border border-border rounded-2xl shadow-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="text-sm font-semibold num">{format(last, fmt)}</p>
      </div>
      <div className="mt-3 flex items-end gap-1 h-20" aria-label={`${label} by year`}>
        {nums.map((v, i) => (
          <div key={years[i]} className="flex-1 flex flex-col items-center justify-end h-full" title={`FY${years[i]}: ${format(v, fmt)}`}>
            <div
              className={`w-full rounded-t ${v != null && v < 0 ? "bg-danger/70" : color}`}
              style={{ height: `${v == null ? 0 : Math.max((Math.abs(v) / max) * 100, 2)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-1 num">
        <span>{years[0]}</span>
        <span>{years.at(-1)}</span>
      </div>
    </div>
  );
}

/** About 10 years of annual figures from SEC XBRL. */
export function LongTermFinancials({ accountId, symbol }: { accountId: string; symbol: string }) {
  const [data, setData] = useState<CompanyFinancials | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/accounts/${accountId}/company/${encodeURIComponent(symbol)}/financials`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.ok) setData(body);
        else setError(body.error ?? "Couldn't load financials");
      })
      .catch(() => live && setError("Couldn't load financials"));
    return () => {
      live = false;
    };
  }, [accountId, symbol]);

  if (error) return <div className="bg-card border border-border rounded-2xl shadow-card p-6 text-sm text-muted">{error}</div>;
  if (!data) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-card p-8 flex items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading 10-year financials from SEC…
      </div>
    );
  }
  if (!data.years.length) return <div className="bg-card border border-border rounded-2xl shadow-card p-6 text-sm text-muted">No annual XBRL data found.</div>;

  const years = data.years.map((y) => y.fiscalYear);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Bars label="Revenue" values={data.years.map((y) => y.revenue)} years={years} fmt="money" color="bg-accent/70" />
        <Bars label="Free cash flow" values={data.years.map((y) => y.freeCashFlow)} years={years} fmt="money" color="bg-success/70" />
        <Bars label="Operating margin" values={data.years.map((y) => y.operatingMargin)} years={years} fmt="pct" color="bg-speculation/70" />
        <Bars label="ROIC" values={data.years.map((y) => y.roic)} years={years} fmt="pct" color="bg-core/70" />
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">10-year record</h3>
          <p className="text-[11px] text-muted">
            {data.entityName} · SEC XBRL · {data.currency}
            {data.currencyNote ? ` · ${data.currencyNote}` : ""}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs num">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-4 py-2 text-left font-medium sticky left-0 bg-card">Fiscal year</th>
                {years.map((y) => (
                  <th key={y} className="px-3 py-2 text-right font-medium">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-border/40 hover:bg-card-hover/50">
                  <td className="px-4 py-2 text-left font-sans font-medium whitespace-nowrap sticky left-0 bg-card" title={row.hint}>
                    {row.label}
                  </td>
                  {data.years.map((y, i) => {
                    const v = row.value(y, data.years[i - 1]);
                    return (
                      <td key={y.fiscalYear} className={`px-3 py-2 text-right whitespace-nowrap ${v != null && v < 0 ? "text-danger" : ""}`}>
                        {format(v, row.fmt)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
