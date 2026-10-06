"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { BUILTIN_LENS_KEYS, LENSES, type BuiltinLensKey } from "@/lib/research/lenses";

/** Static class names per lens so Tailwind picks them up. */
export const LENS_STYLE: Record<BuiltinLensKey, { dot: string; active: string; ring: string; text: string }> = {
  buffett: { dot: "bg-success", active: "bg-success text-white border-success", ring: "hover:border-success/50", text: "text-success" },
  lynch: { dot: "bg-accent", active: "bg-accent text-white border-accent", ring: "hover:border-accent/50", text: "text-accent" },
  druckenmiller: {
    dot: "bg-speculation",
    active: "bg-speculation text-white border-speculation",
    ring: "hover:border-speculation/50",
    text: "text-speculation",
  },
};

/** Pill row for choosing the investor lens a conversation or report uses. */
export function LensPills({
  value,
  onChange,
  onOwnStrategy,
  disabled,
  noneLabel = "None",
}: {
  value: string | null;
  /** Label for the no-lens option (e.g. "My criteria" where scoring falls back to the user's own). */
  noneLabel?: string;
  onChange: (lens: string | null) => void;
  /** Opens the strategy builder; also enables the "My strategy" picker of saved strategies. */
  onOwnStrategy?: () => void;
  disabled?: boolean;
}) {
  const base = "shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50";
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="radiogroup" aria-label="Investor lens">
      <span className="shrink-0 text-[11px] text-muted mr-0.5">Lens</span>
      <button
        type="button"
        role="radio"
        aria-checked={value == null}
        disabled={disabled}
        onClick={() => onChange(null)}
        className={`${base} ${value == null ? "bg-foreground text-background border-foreground" : "border-border text-muted hover:text-foreground"}`}
      >
        {noneLabel}
      </button>
      {BUILTIN_LENS_KEYS.map((key) => {
        const active = value === key;
        const style = LENS_STYLE[key];
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(active ? null : key)}
            title={`${LENSES[key].tagline} (inspired by ${LENSES[key].inspiredBy})`}
            className={`${base} ${active ? style.active : `border-border text-foreground/80 ${style.ring}`}`}
          >
            {!active && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
            {LENSES[key].name}
          </button>
        );
      })}
      {onOwnStrategy && <StrategyPill value={value} onChange={onChange} onBuild={onOwnStrategy} disabled={disabled} base={base} />}
    </div>
  );
}

const BUILD = "__build__";

/** "My strategy" pill: pick a saved strategy as the lens, or jump to the builder. */
function StrategyPill({
  value,
  onChange,
  onBuild,
  disabled,
  base,
}: {
  value: string | null;
  onChange: (lens: string | null) => void;
  onBuild: () => void;
  disabled?: boolean;
  base: string;
}) {
  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let live = true;
    fetch("/api/research-strategies")
      .then((r) => (r.ok ? r.json() : { strategies: [] }))
      .then((d) => live && setStrategies(d.strategies ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const active = value?.startsWith("strategy:") ?? false;
  const activeName = active ? strategies.find((s) => `strategy:${s.id}` === value)?.name : null;

  if (!strategies.length) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onBuild}
        className={`${base} border-dashed border-border text-muted hover:text-foreground`}
        title="Build your own research strategy in the Screener"
      >
        <SlidersHorizontal className="w-3 h-3" />
        My strategy
      </button>
    );
  }

  return (
    <label
      className={`${base} relative cursor-pointer ${active ? "bg-foreground text-background border-foreground" : "border-dashed border-border text-muted hover:text-foreground"}`}
      title="Use one of your saved strategies as the lens"
    >
      <SlidersHorizontal className="w-3 h-3" />
      {activeName ?? "My strategy"} ▾
      <select
        value={active ? value! : ""}
        disabled={disabled}
        onChange={(e) => (e.target.value === BUILD ? onBuild() : onChange(e.target.value || null))}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Your strategies"
      >
        <option value="">My strategy…</option>
        {strategies.map((s) => (
          <option key={s.id} value={`strategy:${s.id}`}>
            {s.name}
          </option>
        ))}
        <option value={BUILD}>Build a new strategy…</option>
      </select>
    </label>
  );
}

/** Large lens cards for the Analyst's empty state. */
export function LensCards({
  onPick,
  onOwnStrategy,
}: {
  onPick: (lens: BuiltinLensKey, example: string) => void;
  onOwnStrategy?: () => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {BUILTIN_LENS_KEYS.map((key) => {
        const lens = LENSES[key];
        const style = LENS_STYLE[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key, lens.example)}
            className={`text-left rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:bg-card-hover ${style.ring}`}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
              {lens.name}-style research
            </p>
            <p className={`text-[11px] font-medium mt-0.5 ${style.text}`}>{lens.tagline}</p>
            <p className="text-xs text-muted mt-1.5 line-clamp-3">{lens.philosophy}</p>
            <p className="text-[11px] text-foreground/70 mt-2">Try: “{lens.example}”</p>
          </button>
        );
      })}
      {onOwnStrategy && (
        <button
          type="button"
          onClick={onOwnStrategy}
          className="text-left rounded-xl border border-dashed border-border bg-background px-4 py-3 transition-colors hover:bg-card-hover hover:border-accent/50"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted" />
            Your own strategy
          </p>
          <p className="text-xs text-muted mt-1.5">
            Set your own screening filters, scoring thresholds and research questions, then have the Analyst research the
            results.
          </p>
          <p className="text-[11px] text-accent mt-2">Open the Screener →</p>
        </button>
      )}
    </div>
  );
}
