"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Info, X } from "lucide-react";
import { tradingViewSymbol, tradingViewUrl } from "@/lib/tradingview";
import { TradingViewChart } from "./TradingViewChart";

export interface ChartTarget {
  /** App symbol (Yahoo ticker or routine symbol). */
  symbol: string;
  label: string;
}

const INTERVALS = [
  { value: "D", label: "Daily" },
  { value: "W", label: "Weekly" },
  { value: "M", label: "Monthly" },
] as const;

/** Full-screen chart panel with quick switching between the routine's markets. */
export function ChartPanel({
  target,
  related,
  onSelect,
  onClose,
}: {
  target: ChartTarget;
  /** Markets to jump between without closing the panel. */
  related: ChartTarget[];
  onSelect: (t: ChartTarget) => void;
  onClose: () => void;
}) {
  const [interval, setInterval] = useState<"D" | "W" | "M">("D");
  const tv = tradingViewSymbol(target.symbol);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Portal to <body>: an animated (transformed) ancestor would otherwise trap
  // this fixed overlay inside the step card and clip it under the top bar.
  // The overlay itself scrolls, so a tall panel is reachable on short screens.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${target.label} chart`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative mx-auto my-6 w-[calc(100%-2rem)] max-w-[1400px] rounded-2xl border border-border bg-card shadow-card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{target.label}</h2>
            <p className="text-xs text-muted">
              {tv.symbol} · 9 EMA and 20/50/100/200 SMA loaded
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {INTERVALS.map((i) => (
                <button
                  key={i.value}
                  type="button"
                  onClick={() => setInterval(i.value)}
                  className={`text-xs font-medium rounded-md px-2.5 py-1 transition-colors ${
                    interval === i.value ? "bg-accent text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
            <a
              href={tradingViewUrl(tv.full ?? tv.symbol)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground hover:bg-card-hover"
            >
              {tv.full ? `Open ${tv.full} in TradingView` : "Open in TradingView"}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover"
              aria-label="Close chart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {tv.note && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Info className="w-3.5 h-3.5 shrink-0" />
            {tv.note}
          </p>
        )}

        <TradingViewChart symbol={tv.symbol} interval={interval} className="h-[max(380px,calc(100vh-300px))]" />

        <div className="flex flex-wrap gap-1.5">
          {related.map((r) => (
            <button
              key={r.symbol}
              type="button"
              onClick={() => onSelect(r)}
              className={`text-xs rounded-lg border px-2.5 py-1 transition-colors ${
                r.symbol === target.symbol
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-foreground hover:bg-card-hover"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
