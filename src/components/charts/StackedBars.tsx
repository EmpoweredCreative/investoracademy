"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** About four "nice" intervals covering [min, max]. */
function ticks(min: number, max: number): number[] {
  const span = max - min || 1;
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 1000; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

const PAD = { top: 12, right: 8, bottom: 22, left: 52 };

/**
 * Stacked bars per period. Positive values stack up from zero, negative ones
 * down. Periods from `projectedFrom` on are drawn lighter with hatching.
 */
export function StackedBars({
  labels,
  series,
  projectedFrom,
  format,
  tooltip,
  height = 240,
  ariaLabel,
  animKey = "",
}: {
  labels: string[];
  series: BarSeries[];
  /** Index of the first projected period (labels.length = none). */
  projectedFrom: number;
  format: (v: number) => string;
  tooltip: (i: number) => ReactNode;
  height?: number;
  ariaLabel: string;
  /** Change to replay the grow-in animation (e.g. when series are toggled). */
  animKey?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const hatchId = useId().replace(/:/g, "");
  const n = labels.length;

  const pos = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i] ?? 0), 0));
  const neg = labels.map((_, i) => series.reduce((s, x) => s + Math.min(0, x.values[i] ?? 0), 0));
  const yTicks = ticks(Math.min(0, ...neg), Math.max(0, ...pos) || 1);
  const y0 = yTicks[0];
  const y1 = yTicks[yTicks.length - 1];
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const slot = n ? iw / n : 0;
  const barW = Math.max(4, Math.min(36, slot * 0.62));
  const x = (i: number) => PAD.left + slot * i + (slot - barW) / 2;
  const y = (v: number) => PAD.top + ih - ((v - y0) / (y1 - y0 || 1)) * ih;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg key={animKey} width={width} height={height} role="img" aria-label={ariaLabel}>
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--card)" strokeWidth="2.5" />
            </pattern>
          </defs>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--muted)" : "var(--grid-line)"} strokeOpacity={t === 0 ? 0.5 : 1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] num">
                {format(t)}
              </text>
            </g>
          ))}
          {projectedFrom < n && (
            <text x={x(projectedFrom)} y={PAD.top - 2} className="fill-muted text-[10px]">
              Projected →
            </text>
          )}
          {hover != null && (
            <rect x={PAD.left + slot * hover + 2} y={PAD.top} width={slot - 4} height={ih} rx="6" fill="var(--accent)" fillOpacity="0.07" />
          )}
          {labels.map((l, i) => {
            const projected = i >= projectedFrom;
            let up = 0;
            let down = 0;
            return (
              <g key={l} opacity={hover != null && hover !== i ? 0.5 : 1} style={{ transition: "opacity 0.2s" }}>
                <g className="grow-y" style={{ ["--origin" as string]: `${y(0)}px`, ["--d" as string]: `${i * 45}ms` }}>
                {series.map((s) => {
                  const v = s.values[i] ?? 0;
                  if (v === 0) return null;
                  const from = v > 0 ? up : down;
                  const to = from + v;
                  if (v > 0) up = to;
                  else down = to;
                  const top = y(Math.max(from, to));
                  const h = Math.max(1, Math.abs(y(from) - y(to)));
                  return (
                    <g key={s.key}>
                      <rect x={x(i)} y={top} width={barW} height={h} rx="2" fill={s.color} fillOpacity={projected ? 0.45 : 1} stroke="var(--card)" strokeWidth="1" />
                      {projected && <rect x={x(i)} y={top} width={barW} height={h} rx="2" fill={`url(#${hatchId})`} />}
                    </g>
                  );
                })}
                </g>
                <text x={x(i) + barW / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
                  {l}
                </text>
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={ih}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-card whitespace-nowrap z-10"
          style={{ left: Math.min(Math.max(x(hover) + barW / 2, 110), width - 110) }}
        >
          {tooltip(hover)}
        </div>
      )}
    </div>
  );
}

/** Legend with each series' total, so identity and values never rely on color alone. */
export function BarLegend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
          {i.value && <span className="num text-foreground">{i.value}</span>}
        </span>
      ))}
    </div>
  );
}
