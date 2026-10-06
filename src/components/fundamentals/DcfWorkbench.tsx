"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InfoTip } from "@/components/ui/InfoTip";
import { Panel, fmtUsd } from "@/components/live/primitives";
import { cagr, runDcf, scenarios, sensitivityGrid, type AnnualFinancials, type DcfAssumptions } from "@/lib/fundamentals/dcf";

/** Plain-English explanations for each assumption (shown in the ⓘ tips). */
const HELP = {
  growth:
    "How fast free cash flow grows each year during the high-growth period. Compare it with the company's history shown underneath; assuming much faster growth than it has delivered is the most common way to overvalue a stock.",
  highGrowthYears:
    "How many years the growth rate above lasts. After that, growth fades step by step down to the terminal rate by year 10. More years at a high rate means a higher value.",
  discountRate:
    "The yearly return you require, used to convert future cash into today's dollars (WACC: weighted average cost of capital). Higher means future cash is worth less today, so the value goes down. 8–10% is typical for an established company; use more for riskier ones.",
  terminalGrowth:
    "How fast cash flow grows forever after year 10. Keep it at or below long-run economic growth (about 2–3%). It must be below the discount rate, and small changes here move the value a lot.",
  exitMultiple:
    "Instead of assuming growth forever, value the company at the end of year 10 as a multiple of that year's free cash flow, like a sale price. 15–20× is common for a mature business.",
  baseFcf:
    "The free cash flow the projection starts from: operating cash flow minus capital spending. The suggested value averages recent years to smooth out lumpy ones. In billions.",
  shares:
    "Diluted shares outstanding, in billions. The company's total value is divided by this to get value per share. Buybacks shrink it; stock compensation grows it.",
  cash: "Cash and short-term investments, in billions. Added to the value of the business because it belongs to shareholders.",
  debt: "Total borrowings, in billions. Subtracted from the value of the business because lenders are paid before shareholders.",
} as const;

interface SavedModel {
  id: string;
  name: string | null;
  createdBy: string;
  createdAt: string;
  assumptions: DcfAssumptions;
  outputs: { intrinsicPerShare: number; marginOfSafety: number | null };
}

interface DcfContext {
  history: AnnualFinancials[];
  price: number | null;
  currencyNote: string | null;
  suggested: DcfAssumptions | null;
  models: SavedModel[];
}

const B = 1e9;

export function DcfWorkbench({ accountId, symbol, onSaved }: { accountId: string; symbol: string; onSaved?: () => void }) {
  const url = `/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}/dcf`;
  const [ctx, setCtx] = useState<DcfContext | null>(null);
  const [a, setA] = useState<DcfAssumptions | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(
    () =>
      fetch(url, { cache: "no-store" })
        .then(async (res) => ({ ok: res.ok, data: await res.json() }))
        .then(({ ok, data }) => {
          if (!ok) {
            setError(data.error ?? "Could not load financial history");
            return;
          }
          setCtx(data);
          setA((cur) => cur ?? (data.models[0]?.assumptions ? { ...data.models[0].assumptions, price: data.price } : data.suggested));
        })
        .catch(() => setError("Could not load financial history")),
    [url]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const computed = useMemo(() => {
    if (!a) return null;
    try {
      return { result: runDcf(a), grid: sensitivityGrid(a), scen: scenarios(a), error: null as string | null };
    } catch (e) {
      return { result: null, grid: null, scen: null, error: e instanceof Error ? e.message : "Invalid assumptions" };
    }
  }, [a]);

  if (error) return <p className="text-sm text-danger p-4">{error}</p>;
  if (!ctx || !a) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading annual financials…
      </div>
    );
  }
  if (!ctx.suggested) {
    return <p className="p-6 text-sm text-muted">Yahoo doesn&apos;t have enough cash-flow history for {symbol} to build a DCF.</p>;
  }

  const set = <K extends keyof DcfAssumptions>(k: K, v: DcfAssumptions[K]) => setA((cur) => (cur ? { ...cur, [k]: v } : cur));
  const r = computed?.result;
  const price = ctx.price;
  const mos = r?.marginOfSafety ?? null;
  const fcfCagr = cagr(ctx.history.map((h) => h.freeCashFlow));
  const revCagr = cagr(ctx.history.map((h) => h.revenue));

  const save = async () => {
    setSaving(true);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assumptions: { ...a, price }, name: name.trim() || null }),
    });
    setSaving(false);
    if (res.ok) {
      setName("");
      await load();
      onSaved?.();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Could not save");
    }
  };

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Headline label="Intrinsic value" value={r ? fmtUsd(r.intrinsicPerShare) : "—"} big />
        <Headline label="Price" value={price != null ? fmtUsd(price) : "—"} />
        <Headline
          label="Margin of safety"
          value={mos != null ? `${mos.toFixed(1)}%` : "—"}
          tone={mos == null ? "" : mos >= 25 ? "text-success" : mos >= 0 ? "text-warning" : "text-danger"}
        />
        <Headline label="Value from terminal" value={r ? `${r.terminalShare.toFixed(0)}%` : "—"} tone={r && r.terminalShare > 75 ? "text-warning" : ""} />
      </div>
      {ctx.currencyNote && <p className="text-xs text-muted">{ctx.currencyNote}.</p>}
      {computed?.error && <p className="text-sm text-danger">{computed.error}</p>}
      {r && r.warnings.length > 0 && (
        <ul className="text-xs text-warning space-y-0.5">
          {r.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Assumptions */}
        <Panel
          title="Assumptions"
          right={
            <button
              type="button"
              onClick={() => setA({ ...ctx.suggested!, price })}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
              title="Reset to suggested"
            >
              <RotateCcw className="w-3 h-3" /> Suggested
            </button>
          }
        >
          <div className="space-y-4">
            <Slider
              label="Growth, years 1–N"
              info={HELP.growth}
              value={a.growthRate}
              min={-10}
              max={40}
              step={0.5}
              suffix="%"
              hint={`History: FCF ${fcfCagr != null ? `${fcfCagr.toFixed(1)}%` : "n/a"} · revenue ${revCagr != null ? `${revCagr.toFixed(1)}%` : "n/a"} a year`}
              onChange={(v) => set("growthRate", v)}
            />
            <Slider label="High-growth years" info={HELP.highGrowthYears} value={a.highGrowthYears} min={1} max={10} step={1} onChange={(v) => set("highGrowthYears", v)} />
            <Slider label="Discount rate (WACC)" info={HELP.discountRate} value={a.discountRate} min={5} max={16} step={0.25} suffix="%" onChange={(v) => set("discountRate", v)} />
            <Slider
              label="Terminal growth"
              info={HELP.terminalGrowth}
              value={a.terminalGrowth}
              min={0}
              max={5}
              step={0.25}
              suffix="%"
              disabled={a.exitMultiple != null}
              onChange={(v) => set("terminalGrowth", v)}
            />
            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={a.exitMultiple != null}
                  onChange={(e) => set("exitMultiple", e.target.checked ? 18 : null)}
                  className="accent-[var(--accent)]"
                />
                Exit multiple instead
                <InfoTip label="Exit multiple">{HELP.exitMultiple}</InfoTip>
              </label>
              {a.exitMultiple != null && (
                <NumberField value={a.exitMultiple} onChange={(v) => set("exitMultiple", v)} suffix="× FCF" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <LabeledNumber label="Starting FCF" info={HELP.baseFcf} value={a.baseFcf / B} onChange={(v) => set("baseFcf", v * B)} suffix="B" />
              <LabeledNumber label="Shares" info={HELP.shares} value={a.sharesOutstanding / B} onChange={(v) => v > 0 && set("sharesOutstanding", v * B)} suffix="B" />
              <LabeledNumber label="Cash" info={HELP.cash} value={a.cash / B} onChange={(v) => set("cash", v * B)} suffix="B" />
              <LabeledNumber label="Debt" info={HELP.debt} value={a.debt / B} onChange={(v) => set("debt", v * B)} suffix="B" />
            </div>
          </div>
        </Panel>

        {/* History + projection */}
        <Panel title="Free cash flow" subtitle="history → projection">
          <FcfChart history={ctx.history} projection={r?.years.map((y) => y.fcf) ?? []} />
          {computed?.scen && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              {(["bear", "base", "bull"] as const).map((k) => (
                <div key={k} className="rounded-lg border border-border px-2.5 py-1.5">
                  <div className="text-muted capitalize">{k}</div>
                  <div className="num font-semibold">{computed.scen![k] != null ? fmtUsd(computed.scen![k]!) : "—"}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Sensitivity */}
      {computed?.grid && (
        <Panel title="Sensitivity" subtitle="intrinsic value per share · discount rate × terminal growth" bodyClassName="p-3 overflow-x-auto">
          <table className="w-full text-xs num">
            <thead>
              <tr>
                <th className="p-1.5 text-left text-muted font-medium">WACC \ g</th>
                {computed.grid.terminalGrowths.map((g) => (
                  <th key={g} className="p-1.5 text-right text-muted font-medium">
                    {g.toFixed(2)}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computed.grid.discountRates.map((dr, i) => (
                <tr key={dr}>
                  <td className="p-1.5 text-muted">{dr.toFixed(2)}%</td>
                  {computed.grid!.values[i].map((v, j) => {
                    const up = v != null && price != null ? (v - price) / price : null;
                    const bg =
                      up == null
                        ? "transparent"
                        : `color-mix(in oklab, ${up >= 0 ? "var(--success)" : "var(--danger)"} ${Math.min(45, Math.abs(up) * 60)}%, transparent)`;
                    const center = i === 2 && j === 2;
                    return (
                      <td key={j} className={`p-1.5 text-right rounded ${center ? "ring-1 ring-foreground/40 font-semibold" : ""}`} style={{ background: bg }}>
                        {v != null ? v.toFixed(0) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Save + saved models */}
      <Panel title="Saved models" subtitle="the latest feeds your margin-of-safety criterion">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this model (optional)"
            className="flex-1 min-w-40 px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
          />
          <Button size="sm" onClick={save} loading={saving} disabled={!r}>
            <Save className="w-3.5 h-3.5" /> Save model
          </Button>
        </div>
        {ctx.models.length === 0 ? (
          <p className="text-xs text-muted">No saved models yet.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {ctx.models.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setA({ ...m.assumptions, price })}
                  className="w-full flex items-center gap-3 py-2 text-left text-sm hover:text-accent"
                >
                  {m.createdBy === "claude" && <Bot className="w-3.5 h-3.5 text-accent" />}
                  <span className="flex-1 truncate">{m.name ?? "Untitled model"}</span>
                  <span className="num text-xs text-muted">
                    {m.assumptions.growthRate}% · {m.assumptions.discountRate}% · {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                  <span className="num font-semibold">{fmtUsd(m.outputs.intrinsicPerShare)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Headline({ label, value, tone = "", big }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-card">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`num font-semibold ${big ? "text-2xl" : "text-xl"} ${tone}`}>{value}</div>
    </div>
  );
}

function Slider({
  label,
  info,
  value,
  min,
  max,
  step,
  suffix = "",
  hint,
  disabled,
  onChange,
}: {
  label: string;
  info?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  hint?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">
          {label}
          {info && <InfoTip label={label}>{info}</InfoTip>}
        </span>
        <span className="num font-semibold">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function NumberField({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        value={Number(value.toFixed(3))}
        step="any"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className="num w-24 px-2 py-1 bg-background border border-border rounded-lg text-sm text-right"
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </span>
  );
}

function LabeledNumber({
  label,
  info,
  value,
  onChange,
  suffix,
}: {
  label: string;
  info?: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-muted">
        {label}
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </span>
      <NumberField value={value} onChange={onChange} suffix={suffix} />
    </label>
  );
}

/** Bars: reported FCF (solid) then 10 projected years (lighter), in billions. */
function FcfChart({ history, projection }: { history: AnnualFinancials[]; projection: number[] }) {
  const hist = history.map((h) => ({ label: String(h.year), v: h.freeCashFlow ?? 0, projected: false }));
  const lastYear = history.length ? history[history.length - 1].year : new Date().getFullYear();
  const proj = projection.map((v, i) => ({ label: String(lastYear + i + 1), v, projected: true }));
  const bars = [...hist, ...proj];
  const max = Math.max(...bars.map((b) => Math.abs(b.v)), 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-36">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group" title={`${b.label}: $${(b.v / B).toFixed(1)}B`}>
            <div
              className={`w-full rounded-t transition-[height] duration-500 ${b.projected ? "bg-accent/35" : b.v >= 0 ? "bg-accent" : "bg-danger"}`}
              style={{ height: `${(Math.abs(b.v) / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1 text-[9px] text-muted num">
        {bars.map((b, i) => (
          <span key={i} className="flex-1 text-center">
            {i % 2 === 0 || !b.projected ? `'${b.label.slice(2)}` : ""}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Reported (solid) vs projected (light). Latest reported: <span className="num">${((history[history.length - 1]?.freeCashFlow ?? 0) / B).toFixed(1)}B</span>
      </p>
    </div>
  );
}
