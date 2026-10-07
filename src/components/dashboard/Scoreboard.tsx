"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { BadgeDollarSign, ChevronDown, CreditCard, Landmark, LineChart, Percent, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { StackedBars } from "@/components/charts/StackedBars";
import type { Stat, StatKey } from "@/lib/dashboard/scoreboard";
import { CountUp } from "./motion";

export interface ScoreboardData {
  stats: Stat[];
  winning: number;
  scored: number;
}

const ICONS: Record<StatKey, typeof Wallet> = {
  cashFlow: Wallet,
  netWorth: LineChart,
  roi: Percent,
  stockGained: BadgeDollarSign,
  debtReduction: CreditCard,
  interest: Landmark,
};

const fmtValue = (s: Pick<Stat, "format">, v: number) =>
  s.format === "percent"
    ? `${(v * 100).toFixed(2)}%`
    : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtAxis = (s: Pick<Stat, "format">, v: number) =>
  s.format === "percent" ? `${(v * 100).toFixed(1)}%` : Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}$${(Math.abs(v) / 1000).toFixed(0)}k` : `$${Math.round(v)}`;

/** Sample scoreboard for people with no data yet, so the layout reads as it will. */
function sampleBoard(): ScoreboardData {
  const L = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mk = (key: StatKey, label: string, value: number, previous: number, series: (number | null)[], higher = true, format: Stat["format"] = "money"): Stat => ({
    key,
    label,
    format,
    value,
    previous,
    change: value - previous,
    winning: higher ? value >= previous : value <= previous,
    period: key === "netWorth" ? "Now" : key === "interest" ? "This month" : "September",
    sub: "Sample: your numbers appear as you add them",
    series,
    seriesLabels: L,
    seriesNote: "",
    estimated: false,
  });
  const ramp = (a: number, b: number, n = 9): (number | null)[] => [...Array.from({ length: n }, (_, i) => Math.round(a + ((b - a) * i) / (n - 1) + Math.sin(i * 1.3) * (b - a) * 0.08)), ...Array(12 - n).fill(null)];
  return {
    winning: 5,
    scored: 6,
    stats: [
      mk("cashFlow", "Cash flow", 3_420, 2_980, ramp(1_900, 3_420)),
      mk("netWorth", "Net worth", 286_000, 279_400, ramp(241_000, 286_000, 10)),
      mk("roi", "ROI on capital used", 0.031, 0.027, ramp(18, 31).map((v) => (v == null ? null : v / 1000)), true, "percent"),
      mk("stockGained", "Stock assets gained", 4_300, 3_100, [0, 2400, 0, 5200, 0, 1800, 3100, 3100, 4300, null, null, null]),
      mk("debtReduction", "Debt reduction", 1_240, 1_310, ramp(900, 1_240)),
      mk("interest", "Interest paid to lenders", 612, 641, Array.from({ length: 12 }, (_, i) => 612 - i * 14), false),
    ],
  };
}

export function Scoreboard({ data }: { data: ScoreboardData }) {
  const empty = data.stats.every((s) => !s.value);
  const board = empty ? sampleBoard() : data;
  const [open, setOpen] = useState<StatKey | null>(null);
  const selected = board.stats.find((s) => s.key === open) ?? null;
  const ref = board.stats.find((s) => s.key === "cashFlow");

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted flex items-center gap-2">
            Your scoreboard
            {empty && (
              <span className="rounded-full border border-dashed border-accent/50 bg-accent/5 px-2 py-0.5 text-[10px] font-semibold text-accent">SAMPLE</span>
            )}
          </h2>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {board.scored === 0 ? (
              "Your scoreboard fills in as months go by"
            ) : (
              <>
                You&apos;re{" "}
                <span className={board.winning * 2 >= board.scored ? "text-success" : "text-danger"}>
                  {board.winning * 2 >= board.scored ? "winning" : "losing ground"}
                </span>{" "}
                on {board.winning} of {board.scored}
              </>
            )}
          </p>
          <p className="text-xs text-muted">{ref ? `${ref.period} compared with the month before` : ""}</p>
        </div>
        <Gauge stats={board.stats} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" style={{ perspective: "1200px" }}>
        {board.stats.map((s, i) => (
          <StatCard key={s.key} stat={s} index={i} active={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)} />
        ))}
      </div>

      {selected && <StatDetail stat={selected} sample={empty} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Six segments, one per stat, lighting up green (winning), red (losing) or gray. */
function Gauge({ stats }: { stats: Stat[] }) {
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={`${stats.filter((s) => s.winning).length} of ${stats.length} winning`}>
      {stats.map((s, i) => (
        <span
          key={s.key}
          title={`${s.label}: ${s.winning == null ? "no comparison yet" : s.winning ? "winning" : "losing"}`}
          className={`seg-on block w-3 rounded-full ${s.winning == null ? "bg-border" : s.winning ? "bg-success" : "bg-danger"}`}
          style={{ height: 14 + i * 5, ["--d" as string]: `${300 + i * 110}ms` }}
        />
      ))}
    </div>
  );
}

/** A card that tilts in 3D toward the pointer, with a light glare and a raised value layer. */
function StatCard({ stat: s, index, active, onClick }: { stat: Stat; index: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 50, on: false });
  const Icon = ICONS[s.key];
  const tone = s.winning == null ? "neutral" : s.winning ? "win" : "lose";
  const glow =
    tone === "win" ? "hover:shadow-[0_18px_40px_-18px_var(--success)]" : tone === "lose" ? "hover:shadow-[0_18px_40px_-18px_var(--danger)]" : "";

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 10, y: (px - 0.5) * 12, gx: px * 100, gy: py * 100, on: true });
  };

  const values = s.series.filter((v): v is number => v != null);

  return (
    <div className="flip-in" style={{ ["--i" as string]: index }}>
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onPointerMove={move}
        onPointerLeave={() => setTilt({ x: 0, y: 0, gx: 50, gy: 50, on: false })}
        aria-expanded={active}
        className={`tilt group relative w-full overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-card ${glow} ${
          active ? "border-accent ring-2 ring-accent/30" : "border-border"
        }`}
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        {/* Glare */}
        <span
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: tilt.on ? 1 : 0,
            background: `radial-gradient(420px circle at ${tilt.gx}% ${tilt.gy}%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 45%)`,
          }}
        />
        {/* Win/lose edge */}
        <span className={`absolute inset-x-0 top-0 h-1 ${tone === "win" ? "bg-success" : tone === "lose" ? "bg-danger" : "bg-border"}`} />

        <div className="tilt-depth relative">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/10 text-accent">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{s.label}</p>
              <p className="text-[11px] text-muted">
                {s.period}
                {s.estimated && " · estimate"}
              </p>
            </div>
            {tone !== "neutral" && (
              <span
                className={`pop ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  tone === "win" ? "bg-success/12 text-success" : "bg-danger/12 text-danger"
                }`}
                style={{ ["--d" as string]: `${700 + index * 90}ms` }}
              >
                {tone === "win" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {tone === "win" ? "Winning" : "Losing"}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              {s.value != null ? (
                <CountUp value={s.value} format={(v) => fmtValue(s, v)} className="block text-3xl font-semibold tracking-tight" duration={1300} />
              ) : (
                <span className="block text-3xl font-semibold text-muted">—</span>
              )}
              {s.change != null && s.change !== 0 && (
                <p className={`num mt-0.5 text-xs font-medium ${tone === "win" ? "text-success" : tone === "lose" ? "text-danger" : "text-muted"}`}>
                  {s.change > 0 ? "▲" : "▼"} {fmtValue(s, Math.abs(s.change))} vs last month
                </p>
              )}
            </div>
            <MiniBars values={s.series} tone={tone} hasData={values.length > 0} />
          </div>
          <p className="mt-2 line-clamp-2 text-[11px] text-muted">{s.sub}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
            {active ? "Hide details" : "See the trend"} <ChevronDown className={`h-3 w-3 transition-transform ${active ? "rotate-180" : ""}`} />
          </span>
        </div>
      </button>
    </div>
  );
}

/** Tiny bar chart of the series, the last bar emphasized; bars grow in. */
function MiniBars({ values, tone, hasData }: { values: (number | null)[]; tone: string; hasData: boolean }) {
  if (!hasData) return null;
  const nums = values.map((v) => v ?? 0);
  const max = Math.max(...nums.map(Math.abs), 1);
  const lastIdx = values.reduce<number>((acc, v, i) => (v != null ? i : acc), 0);
  const color = tone === "lose" ? "var(--danger)" : tone === "win" ? "var(--success)" : "var(--accent)";
  return (
    <svg width="96" height="40" viewBox="0 0 96 40" className="shrink-0" aria-hidden>
      {nums.map((v, i) => {
        const h = Math.max(1.5, (Math.abs(v) / max) * 36);
        return (
          <rect
            key={i}
            x={i * 8}
            y={40 - h}
            width="5"
            height={h}
            rx="1.5"
            fill={values[i] == null ? "var(--border)" : color}
            fillOpacity={values[i] == null ? 0.5 : i === lastIdx ? 1 : 0.35}
            className="grow-y"
            style={{ ["--origin" as string]: "40px", ["--d" as string]: `${400 + i * 40}ms` }}
          />
        );
      })}
    </svg>
  );
}

function StatDetail({ stat: s, sample, onClose }: { stat: Stat; sample: boolean; onClose: () => void }) {
  const lastIdx = s.series.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);
  return (
    <div className="rise-in rounded-2xl border border-accent/30 bg-card p-5 shadow-card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{s.label}</h3>
          <p className="text-xs text-muted">{s.seriesNote || "Sample data"}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-foreground">
          Close
        </button>
      </div>
      <StackedBars
        animKey={s.key}
        ariaLabel={`${s.label} by month`}
        labels={s.seriesLabels}
        projectedFrom={s.key === "interest" ? 1 : s.seriesLabels.length}
        height={220}
        series={[{ key: s.key, label: s.label, color: s.key === "interest" ? "var(--danger)" : "var(--series-1)", values: s.series.map((v) => v ?? 0) }]}
        format={(v) => fmtAxis(s, v)}
        tooltip={(i) => (
          <div>
            <span className="text-muted">{s.seriesLabels[i]}</span>{" "}
            <span className="num font-semibold">{s.series[i] == null ? "—" : fmtValue(s, s.series[i]!)}</span>
            {i === lastIdx && s.key !== "interest" && <span className="text-muted"> · latest</span>}
          </div>
        )}
      />
      {sample && <p className="text-[11px] text-muted">Sample data. Your own history builds month by month.</p>}
      {s.estimated && !sample && (
        <p className="text-[11px] text-muted">
          {s.key === "roi"
            ? "Some buying power is estimated with standard margin rules. Link Schwab or enter the buying power effect on trades for exact numbers."
            : s.key === "interest"
              ? "Projected from your current balances, rates and payments."
              : "Estimated from your scheduled payments until a full month of balance history is saved."}
        </p>
      )}
    </div>
  );
}

export function ScoreboardSkeleton(): ReactNode {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-40 rounded-2xl border border-border bg-card animate-pulse" />
      ))}
    </div>
  );
}
