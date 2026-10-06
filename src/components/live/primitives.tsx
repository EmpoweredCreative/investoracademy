"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// ─── Formatting ──────────────────────────────────────────────

export const fmtUsd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtSigned = (n: number, digits = 2) => `${n >= 0 ? "+" : "−"}${fmtUsd(Math.abs(n), digits)}`;

export const fmtPct = (n: number, digits = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}%`;

export const fmtPrice = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 3 : 2 });

// ─── AnimatedNumber ──────────────────────────────────────────

/** Tweens from the previous value to the new one; mono, tabular digits. */
export function AnimatedNumber({
  value,
  format = (n) => n.toFixed(2),
  duration = 700,
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(a + (b - a) * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = b;
    };
  }, [value, duration]);

  return <span className={`num ${className}`}>{format(display)}</span>;
}

// ─── Flash on change ─────────────────────────────────────────

/** Wraps a value and flashes green/red background when it moves. */
export function Flash({ value, children, className = "" }: { value: number | null; children: ReactNode; className?: string }) {
  const [prev, setPrev] = useState(value);
  const [flash, setFlash] = useState<{ cls: "" | "flash-up" | "flash-down"; key: number }>({ cls: "", key: 0 });

  // Derive the flash from the value change during render (no effect round-trip).
  if (value !== prev) {
    setPrev(value);
    if (value != null && prev != null) {
      setFlash((f) => ({ cls: value > prev ? "flash-up" : "flash-down", key: f.key + 1 }));
    }
  }

  return (
    <span key={flash.key} className={`rounded px-1 -mx-1 ${flash.cls} ${className}`}>
      {children}
    </span>
  );
}

// ─── DeltaChip ───────────────────────────────────────────────

export function DeltaChip({
  value,
  pct,
  size = "sm",
}: {
  value?: number | null;
  pct?: number | null;
  size?: "xs" | "sm" | "md";
}) {
  const basis = value ?? pct ?? 0;
  const up = basis >= 0;
  const sizes = { xs: "text-[10px] px-1.5 py-0", sm: "text-xs px-2 py-0.5", md: "text-sm px-2.5 py-1" };
  return (
    <span
      className={`num inline-flex items-center gap-1 rounded-md font-medium ${sizes[size]} ${
        up ? "bg-success/12 text-success" : "bg-danger/12 text-danger"
      }`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {value != null && fmtSigned(value)}
      {value != null && pct != null && <span className="opacity-60">·</span>}
      {pct != null && fmtPct(pct)}
    </span>
  );
}

// ─── LiveDot ─────────────────────────────────────────────────

export function LiveDot({ tone = "success", pulse = true }: { tone?: "success" | "warning" | "danger" | "muted"; pulse?: boolean }) {
  const color = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", muted: "bg-muted" }[tone];
  return (
    <span className="relative inline-flex w-2 h-2 shrink-0">
      {pulse && <span className={`live-ping absolute inset-0 rounded-full ${color}`} />}
      <span className={`relative inline-flex w-2 h-2 rounded-full ${color}`} />
    </span>
  );
}

// ─── Sparkline ───────────────────────────────────────────────

export function Sparkline({
  points,
  width = 96,
  height = 28,
  baseline,
  className = "",
  fill = true,
}: {
  points: number[];
  width?: number;
  height?: number;
  /** Reference line (e.g. previous close); also decides color. */
  baseline?: number | null;
  className?: string;
  fill?: boolean;
}) {
  const gradId = useId();
  if (points.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }
  const min = Math.min(...points, baseline ?? Infinity);
  const max = Math.max(...points, baseline ?? -Infinity);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= (baseline ?? points[0]);
  const color = up ? "var(--success)" : "var(--danger)";
  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline != null && (
        <line x1="0" x2={width} y1={y(baseline)} y2={y(baseline)} stroke="var(--muted)" strokeOpacity="0.35" strokeDasharray="2 3" />
      )}
      {fill && <path d={`${d} L${lastX},${height} L0,${height} Z`} fill={`url(#${gradId})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.2" fill={color} />
    </svg>
  );
}

// ─── TickerTape ──────────────────────────────────────────────

/** Infinite horizontal marquee; content is duplicated for a seamless loop. Pauses on hover. */
export function TickerTape({ children, duration = 60 }: { children: ReactNode; duration?: number }) {
  return (
    <div className="ticker relative overflow-hidden" style={{ ["--ticker-duration" as string]: `${duration}s` }}>
      <div className="ticker-track flex w-max">
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-card to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────

/** Desk panel with a compact uppercase header, like a trading terminal pane. */
export function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rise-in bg-card border border-border rounded-2xl shadow-card overflow-hidden ${className}`}>
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground truncate">{title}</h2>
          {subtitle && <span className="text-[11px] text-muted truncate">{subtitle}</span>}
        </div>
        {right}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
