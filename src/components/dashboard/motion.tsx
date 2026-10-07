"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatedNumber } from "@/components/live/primitives";
import { countdownLabel, eventInstant } from "@/lib/marketdata/etTime";

/** Counts up from zero on first render, then tweens on every change. */
export function CountUp({
  value,
  format,
  className = "",
  duration = 1100,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <AnimatedNumber value={shown} format={format} duration={duration} className={className} />;
}

/** Circular progress that draws itself in. `value` is 0–1. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  color = "var(--accent)",
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          className="sweep"
          style={{ ["--len" as string]: `${c * v}` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">{children}</div>
    </div>
  );
}

/** Countdown to an ET date/time like ("2026-10-07", "2:00 PM"); ticks every 30s. */
export function useCountdown(date: string | null, time: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const at = date && time ? eventInstant(date, time) : null;
  return at == null ? null : countdownLabel(at - now);
}
