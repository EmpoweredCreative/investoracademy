"use client";

import { useEffect, useState } from "react";
import { DeltaChip, fmtPrice } from "@/components/live/primitives";
import type { LiveQuote } from "@/lib/marketdata/liveQuotes";
import type { Technicals, Trend } from "@/lib/marketdata/technicals";
import { INDICES, type RoutineSymbol } from "@/lib/marketRoutineSymbols";
import { StepLabel } from "./StepCard";
import { ChartPanel, type ChartTarget } from "@/components/charts/ChartPanel";
import { LineChart as ChartIcon } from "lucide-react";

export type Bias = Trend;

interface Board {
  futures: { symbol: string; label: string; name: string; quote: LiveQuote | null }[];
  symbols: (RoutineSymbol & { technicals: Technicals | null })[];
}

export interface ChartStepState {
  biases: Record<string, Bias | null>;
  shortTermTrend: Bias | null;
  intermediateTrend: Bias | null;
  longTermTrend: Bias | null;
  volatilityCondition: string | null;
  breadthCondition: string | null;
}

const MAS = [
  { key: "ema9", label: "9" },
  { key: "sma20", label: "20" },
  { key: "sma50", label: "50" },
  { key: "sma100", label: "100" },
  { key: "sma200", label: "200" },
] as const;

const BIAS_STYLE: Record<Bias, { label: string; on: string; text: string }> = {
  BULLISH: { label: "Bull", on: "bg-success text-background", text: "text-success" },
  NEUTRAL: { label: "Neutral", on: "bg-warning text-background", text: "text-warning" },
  BEARISH: { label: "Bear", on: "bg-danger text-background", text: "text-danger" },
};

export function ChartStep({
  state,
  onBias,
  onField,
}: {
  state: ChartStepState;
  onBias: (symbol: RoutineSymbol, bias: Bias | null, volume: number | null) => void;
  onField: (field: keyof Omit<ChartStepState, "biases">, value: string | null) => void;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);
  const [chart, setChart] = useState<ChartTarget | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/market/routine-board")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((json) => {
          setBoard(json);
          setError(false);
        })
        .catch(() => setError(true));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const indices = board?.symbols.filter((s) => s.category === "INDICES") ?? [];
  const sectors = board?.symbols.filter((s) => s.category === "SECTORS") ?? [];
  const chartTargets: ChartTarget[] = [
    ...(board?.futures ?? []).map((f) => ({ symbol: f.symbol, label: `${f.label} ${f.name}` })),
    ...indices.filter((s) => s.symbol !== "VIX").map((s) => ({ symbol: s.symbol, label: `${s.symbol} ${s.name}` })),
    ...sectors.map((s) => ({ symbol: s.symbol, label: `${s.symbol} ${s.name}` })),
  ];
  const openChart = (symbol: string, label: string) => setChart({ symbol, label });

  const pick = (s: RoutineSymbol & { technicals: Technicals | null }, bias: Bias) =>
    onBias(s, state.biases[s.symbol] === bias ? null : bias, s.technicals?.volume ?? null);

  return (
    <div className="space-y-5">
      {error && !board && <p className="text-sm text-danger">Couldn&apos;t load market data. Retrying every minute.</p>}
      {chart && (
        <ChartPanel target={chart} related={chartTargets} onSelect={setChart} onClose={() => setChart(null)} />
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ChartIcon className="w-3.5 h-3.5" />
        Click any market to open its TradingView chart with your moving averages.
      </p>

      {/* Futures */}
      <div>
        <StepLabel>Futures</StepLabel>
        <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-9 gap-px rounded-xl overflow-hidden border border-border bg-border">
          {(board?.futures ?? Array.from({ length: 9 }, (_, i) => ({ symbol: String(i), label: "", name: "", quote: null }))).map(
            (f) => (
              <button
                key={f.symbol}
                type="button"
                disabled={!f.quote}
                onClick={() => openChart(f.symbol, `${f.label} ${f.name}`)}
                className="bg-card px-3 py-2.5 text-left hover:bg-card-hover transition-colors"
                title={`${f.name} — open chart`}
              >
                {f.quote?.price != null ? (
                  <>
                    <div className="text-[11px] font-semibold text-muted">{f.label}</div>
                    <div className="num text-sm font-semibold mt-0.5">{fmtPrice(f.quote.price)}</div>
                    {f.quote.changePct != null && <DeltaChip pct={f.quote.changePct} size="xs" />}
                  </>
                ) : (
                  <div className="h-[52px] rounded bg-border/40 animate-pulse" />
                )}
              </button>
            )
          )}
        </div>
      </div>

      {/* Indices */}
      <div>
        <StepLabel
          right={
            <span className="text-[11px] text-muted">
              MA dots: <span className="text-success">●</span> price above · <span className="text-danger">●</span> below ·
              Trend D/W/M
            </span>
          }
        >
          Indices & intermarket
        </StepLabel>
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted border-b border-border">
                <th className="text-left font-semibold py-2 px-3">Market</th>
                <th className="text-right font-semibold py-2 px-3">Last</th>
                <th className="text-right font-semibold py-2 px-3">Day</th>
                <th className="text-left font-semibold py-2 px-3">9 · 20 · 50 · 100 · 200</th>
                <th className="text-right font-semibold py-2 px-3">RSI</th>
                <th className="text-center font-semibold py-2 px-3">D / W / M</th>
                <th className="text-left font-semibold py-2 px-3">Your call</th>
              </tr>
            </thead>
            <tbody>
              {(indices.length ? indices : skeletonRows(INDICES.length)).map((s) => {
                const t = s.technicals;
                return (
                  <tr key={s.symbol} className="border-b border-border/50 last:border-0">
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        disabled={!s.name}
                        onClick={() => openChart(s.symbol, `${s.symbol} ${s.name}`)}
                        className="group inline-flex items-center gap-1.5 text-left hover:text-accent"
                        title="Open chart"
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-muted">{s.symbol}</span>
                        <ChartIcon className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100" />
                      </button>
                    </td>
                    <td className="py-2 px-3 text-right num">{t?.price != null ? fmtPrice(t.price) : "—"}</td>
                    <td className="py-2 px-3 text-right">{t?.changePct != null ? <DeltaChip pct={t.changePct} size="xs" /> : "—"}</td>
                    <td className="py-2 px-3">
                      <span className="flex items-center gap-1.5">
                        {MAS.map((m) => {
                          const v = t?.[m.key];
                          const above = t?.price != null && v != null ? t.price > v : null;
                          return (
                            <span
                              key={m.key}
                              title={v != null ? `${m.key.toUpperCase()} ${fmtPrice(v)}` : `${m.key.toUpperCase()} n/a`}
                              className={`w-2.5 h-2.5 rounded-full ${
                                above == null ? "bg-border" : above ? "bg-success" : "bg-danger"
                              }`}
                            />
                          );
                        })}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right num">
                      <Rsi value={t?.rsi14 ?? null} />
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="inline-flex gap-1.5">
                        <TrendArrow t={t?.trend.daily ?? null} label="Daily" />
                        <TrendArrow t={t?.trend.weekly ?? null} label="Weekly" />
                        <TrendArrow t={t?.trend.monthly ?? null} label="Monthly" />
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <BiasPicker value={state.biases[s.symbol] ?? null} suggested={t?.suggested ?? null} onPick={(b) => pick(s, b)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sectors */}
      <div>
        <StepLabel right={<span className="text-[11px] text-muted">Color = today&apos;s move · click a tile for its chart, the button to set your call</span>}>
          Sectors
        </StepLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-2">
          {(sectors.length ? sectors : skeletonRows(11)).map((s) => {
            const t = s.technicals;
            const bias = state.biases[s.symbol] ?? null;
            return (
              <div
                key={s.symbol}
                role="button"
                tabIndex={0}
                onClick={() => s.name && openChart(s.symbol, `${s.symbol} ${s.name}`)}
                onKeyDown={(e) => e.key === "Enter" && s.name && openChart(s.symbol, `${s.symbol} ${s.name}`)}
                className="rounded-xl border border-border p-2.5 cursor-pointer hover:border-accent/50 transition-colors"
                style={{ background: heat(t?.changePct ?? null) }}
                title="Open chart"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{s.symbol}</span>
                  <span className="num text-xs">{t?.changePct != null ? `${t.changePct > 0 ? "+" : ""}${t.changePct.toFixed(2)}%` : ""}</span>
                </div>
                <div className="text-[11px] text-muted truncate">{s.name}</div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="inline-flex gap-1">
                    <TrendArrow t={t?.trend.daily ?? null} label="Daily" />
                    <TrendArrow t={t?.trend.weekly ?? null} label="Weekly" />
                    <TrendArrow t={t?.trend.monthly ?? null} label="Monthly" />
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (s.name) onBias(s, nextBias(bias), t?.volume ?? null);
                    }}
                    className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                      bias ? BIAS_STYLE[bias].on : "border border-border text-muted hover:text-foreground"
                    }`}
                    title="Cycle Bull → Neutral → Bear → clear"
                  >
                    {bias ? BIAS_STYLE[bias].label : "Set"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall outlook */}
      <div>
        <StepLabel>Your outlook</StepLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <OutlookSelect label="Short term" value={state.shortTermTrend} options={BIAS_OPTIONS} onChange={(v) => onField("shortTermTrend", v)} />
          <OutlookSelect label="Intermediate" value={state.intermediateTrend} options={BIAS_OPTIONS} onChange={(v) => onField("intermediateTrend", v)} />
          <OutlookSelect label="Long term" value={state.longTermTrend} options={BIAS_OPTIONS} onChange={(v) => onField("longTermTrend", v)} />
          <OutlookSelect label="Volatility" value={state.volatilityCondition} options={VOL_OPTIONS} onChange={(v) => onField("volatilityCondition", v)} />
          <OutlookSelect
            label="Breadth"
            hint="AR Hi-Low isn't in our data feed yet — check it on your charting platform"
            value={state.breadthCondition}
            options={BREADTH_OPTIONS}
            onChange={(v) => onField("breadthCondition", v)}
          />
        </div>
      </div>
    </div>
  );
}

const BIAS_OPTIONS = [
  { value: "BULLISH", label: "Bullish" },
  { value: "NEUTRAL", label: "Neutral" },
  { value: "BEARISH", label: "Bearish" },
];
const VOL_OPTIONS = [
  { value: "EXPANDING", label: "Expanding" },
  { value: "CONTRACTING", label: "Contracting" },
  { value: "ELEVATED", label: "Elevated" },
  { value: "COMPRESSED", label: "Compressed" },
];
const BREADTH_OPTIONS = [
  { value: "BROAD", label: "Broad" },
  { value: "NARROW", label: "Narrow" },
  { value: "MIXED", label: "Mixed" },
];

function OutlookSelect({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block" title={hint}>
      <span className="text-xs text-muted">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BiasPicker({
  value,
  suggested,
  onPick,
}: {
  value: Bias | null;
  suggested: Bias | null;
  onPick: (b: Bias) => void;
}) {
  return (
    <span className="inline-flex rounded-lg border border-border p-0.5 gap-0.5">
      {(Object.keys(BIAS_STYLE) as Bias[]).map((b) => (
        <button
          key={b}
          type="button"
          onClick={() => onPick(b)}
          title={suggested === b && value !== b ? "Suggested by the trend read" : undefined}
          className={`text-[11px] font-medium rounded-md px-2 py-0.5 transition-colors ${
            value === b
              ? BIAS_STYLE[b].on
              : `text-muted hover:text-foreground ${suggested === b ? "ring-1 ring-inset ring-current " + BIAS_STYLE[b].text : ""}`
          }`}
        >
          {BIAS_STYLE[b].label}
        </button>
      ))}
    </span>
  );
}

function TrendArrow({ t, label }: { t: Trend | null; label: string }) {
  const map = { BULLISH: ["▲", "text-success"], BEARISH: ["▼", "text-danger"], NEUTRAL: ["▶", "text-warning"] } as const;
  const [glyph, cls] = t ? map[t] : ["·", "text-muted"];
  return (
    <span className={`text-[11px] ${cls}`} title={`${label}: ${t ? t.toLowerCase() : "n/a"}`}>
      {glyph}
    </span>
  );
}

function Rsi({ value }: { value: number | null }) {
  if (value == null) return <>—</>;
  const tag = value >= 70 ? { t: "OB", c: "text-danger" } : value <= 30 ? { t: "OS", c: "text-success" } : null;
  return (
    <span title="RSI(14): 70+ overbought, 30− oversold">
      {value.toFixed(0)}
      {tag && <span className={`ml-1 text-[10px] font-semibold ${tag.c}`}>{tag.t}</span>}
    </span>
  );
}

const nextBias = (b: Bias | null): Bias | null =>
  b === null ? "BULLISH" : b === "BULLISH" ? "NEUTRAL" : b === "NEUTRAL" ? "BEARISH" : null;

/** Background tint for a daily % move: green up, red down, ±2% is full strength. */
function heat(pct: number | null): string {
  if (pct == null) return "var(--card)";
  const strength = Math.min(Math.abs(pct) / 2, 1) * 28;
  return `color-mix(in srgb, var(${pct >= 0 ? "--success" : "--danger"}) ${strength.toFixed(0)}%, var(--card))`;
}

function skeletonRows(n: number): (RoutineSymbol & { technicals: Technicals | null })[] {
  return Array.from({ length: n }, (_, i) => ({ symbol: `_${i}`, name: "", category: "INDICES" as const, technicals: null }));
}
