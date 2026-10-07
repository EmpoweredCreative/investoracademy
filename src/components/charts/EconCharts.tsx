"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Measures an element's width so SVG charts draw at true pixel size (no stretched strokes). */
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

/** Three "nice" ticks spanning [min, max]. */
function ticks(min: number, max: number): number[] {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / 2)));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= 4) ?? step * 10;
  const lo = Math.floor(min / nice) * nice;
  const out: number[] = [];
  for (let v = lo; v <= max + nice * 0.001; v += nice) if (v >= min - nice * 0.001) out.push(Number(v.toFixed(6)));
  return out.length >= 2 ? out : [min, max];
}

const PAD = { top: 10, right: 12, bottom: 22, left: 40 };

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-card whitespace-nowrap z-10"
      style={{ left }}
    >
      {children}
    </div>
  );
}

// ─── Single-series line (small multiples) ────────────────────

export function LineChart({
  points,
  format,
  zeroLine = false,
  height = 140,
  label,
}: {
  points: { date: string; value: number }[];
  format: (v: number) => string;
  zeroLine?: boolean;
  height?: number;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return <div className="grid place-items-center text-xs text-muted" style={{ height }}>No data</div>;
  }

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (zeroLine) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  const pad = (max - min) * 0.08 || 0.5;
  const yTicks = ticks(min - pad, max + pad);
  const y0 = yTicks[0];
  const y1 = yTicks[yTicks.length - 1];
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * iw;
  const y = (v: number) => PAD.top + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const first = points[0].date.slice(0, 7);
  const last = points[points.length - 1].date.slice(0, 7);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.round(Math.min(1, Math.max(0, rel)) * (points.length - 1)));
  };

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${label} history`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid-line)" />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] num">
                {format(t)}
              </text>
            </g>
          ))}
          {zeroLine && y0 < 0 && y1 > 0 && (
            <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeOpacity="0.6" />
          )}
          <text x={PAD.left} y={height - 6} className="fill-muted text-[10px]">{first}</text>
          <text x={width - PAD.right} y={height - 6} textAnchor="end" className="fill-muted text-[10px]">{last}</text>
          <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover != null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--muted)" strokeOpacity="0.5" />
              <circle cx={x(hover)} cy={y(points[hover].value)} r="4" fill="var(--series-1)" stroke="var(--card)" strokeWidth="2" />
            </>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={iw}
            height={ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover != null && (
        <Tooltip x={x(hover)} width={width}>
          <span className="text-muted">{points[hover].date}</span>{" "}
          <span className="num font-semibold">{format(points[hover].value)}</span>
        </Tooltip>
      )}
    </div>
  );
}

// ─── Yield curve (three dated curves) ────────────────────────

export interface Curve {
  date: string;
  points: { tenor: string; value: number | null }[];
}

const CURVE_STYLES = [
  { color: "var(--series-1)", dash: undefined },
  { color: "var(--series-2)", dash: "6 4" },
  { color: "var(--series-3)", dash: "2 4" },
];

export function YieldCurveChart({ curves, names, height = 240 }: { curves: Curve[]; names: string[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const tenors = curves[0]?.points.map((p) => p.tenor) ?? [];
  const values = curves.flatMap((c) => c.points.map((p) => p.value)).filter((v): v is number => v != null);

  if (!tenors.length || !values.length) {
    return <div className="grid place-items-center text-sm text-muted" style={{ height }}>No yield data</div>;
  }

  const right = 92; // room for direct labels
  const yTicks = ticks(Math.min(...values) - 0.2, Math.max(...values) + 0.2);
  const y0 = yTicks[0];
  const y1 = yTicks[yTicks.length - 1];
  const iw = Math.max(0, width - PAD.left - right);
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (tenors.length - 1)) * iw;
  const y = (v: number) => PAD.top + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const fmt = (v: number) => `${v.toFixed(2)}%`;

  // Spread direct labels so they don't collide at the right edge.
  const labelYs = curves
    .map((c, i) => ({ i, y: c.points.at(-1)?.value != null ? y(c.points.at(-1)!.value!) : null }))
    .filter((l): l is { i: number; y: number } => l.y != null)
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < labelYs.length; k++) labelYs[k].y = Math.max(labelYs[k].y, labelYs[k - 1].y + 14);

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Treasury yield curve">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + iw} y1={y(t)} y2={y(t)} stroke="var(--grid-line)" />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] num">
                {t.toFixed(1)}%
              </text>
            </g>
          ))}
          {tenors.map((t, i) => (
            <text key={t} x={x(i)} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
              {t}
            </text>
          ))}
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--muted)" strokeOpacity="0.5" />
          )}
          {/* Oldest first so today's curve draws on top */}
          {[...curves.keys()].reverse().map((ci) => {
            const c = curves[ci];
            const s = CURVE_STYLES[ci];
            const pts = c.points.map((p, i) => (p.value != null ? [x(i), y(p.value)] : null)).filter(Boolean) as number[][];
            const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
            return (
              <g key={c.date}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} strokeLinejoin="round" />
                {pts.map(([px, py], i) => (
                  <circle key={i} cx={px} cy={py} r={hover === i ? 5 : 4} fill={s.color} stroke="var(--card)" strokeWidth="2" />
                ))}
              </g>
            );
          })}
          {labelYs.map(({ i, y: ly }) => (
            <text key={i} x={PAD.left + iw + 10} y={ly} dy="0.32em" className="fill-foreground text-[11px]">
              {names[i]}
            </text>
          ))}
          {tenors.map((t, i) => (
            <rect
              key={t}
              x={x(i) - iw / (tenors.length - 1) / 2}
              y={PAD.top}
              width={iw / (tenors.length - 1)}
              height={ih}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
        </svg>
      )}
      {hover != null && (
        <Tooltip x={x(hover)} width={width}>
          <div className="font-semibold mb-0.5">{tenors[hover]} Treasury</div>
          {curves.map((c, i) => (
            <div key={c.date} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: CURVE_STYLES[i].color }} />
              <span className="text-muted">{names[i]}</span>
              <span className="num ml-auto pl-3">{c.points[hover].value != null ? fmt(c.points[hover].value!) : "—"}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/** Legend row for the yield curve (always shown alongside direct labels). */
export function CurveLegend({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {names.map((n, i) => (
        <span key={n} className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="1" x2="21" y1="4" y2="4" stroke={CURVE_STYLES[i].color} strokeWidth="2" strokeDasharray={CURVE_STYLES[i].dash} />
          </svg>
          {n}
        </span>
      ))}
    </div>
  );
}
