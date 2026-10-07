"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CandlestickChart,
  CheckCircle2,
  CreditCard,
  Info,
  Landmark,
  Layers,
  ListChecks,
  PlusCircle,
  Receipt,
  Sparkles,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DeltaChip, Flash, Sparkline, fmtPrice } from "@/components/live/primitives";
import { useLive } from "@/components/live/LiveProvider";
import { BarLegend, StackedBars } from "@/components/charts/StackedBars";
import { CASH_SOURCES, SOURCE_LABEL, type CashSource, type InvestingYear } from "@/lib/dashboard/investing";
import type { AttentionItem } from "@/lib/dashboard/attention";
import type { FoundationSummary } from "@/lib/foundation/calc";
import type { CalendarEvent } from "@/lib/marketdata/fred";
import { fmtMoney, fmtMonth, fmtPct } from "@/lib/foundation/labels";
import { CountUp, ProgressRing, useCountdown } from "./motion";
import type { ScoreboardData } from "./Scoreboard";

export interface DashboardData {
  today: string;
  foundation: {
    ready: boolean;
    profileType: string | null;
    summary: FoundationSummary;
    history: { month: string; netWorth: number }[];
    assets: { type: string; value: number }[];
    businessNet: number | null;
  };
  investing: {
    invested: number;
    dayChange: number;
    dayChangePct: number;
    accounts: { id: string; name: string; mode: string; value: number; dayChange: number }[];
    year: InvestingYear;
  };
  routine: { done: number; total: number; bias: string | null; environment: string | null };
  nextEvent: CalendarEvent | null;
  attention: AttentionItem[];
  scoreboard: ScoreboardData;
}

const short = (v: number) =>
  Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}$${(Math.abs(v) / 1000).toFixed(Math.abs(v) >= 10_000 ? 0 : 1)}k` : fmtMoney(v);
const money0 = (n: number) => fmtMoney(n);

function SampleBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-accent/50 bg-accent/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
      Sample
    </span>
  );
}

// ─── Hero: net worth ─────────────────────────────────────────

const COMPOSITION = [
  { key: "cash", label: "Cash", types: ["CHECKING", "SAVINGS"], color: "var(--series-1)" },
  { key: "investments", label: "Investments", types: ["INVESTMENT"], color: "var(--series-2)" },
  { key: "retirement", label: "Retirement", types: ["RETIREMENT"], color: "var(--series-3)" },
  { key: "property", label: "Home & vehicles", types: ["HOME", "VEHICLE"], color: "var(--series-4)" },
  { key: "business", label: "Business", types: ["BUSINESS"], color: "var(--series-5)" },
  { key: "other", label: "Other", types: ["OTHER"], color: "var(--series-6)" },
];

const SAMPLE_PARTS = [
  { key: "cash", label: "Cash", value: 18_400, color: "var(--series-1)" },
  { key: "investments", label: "Investments", value: 142_000, color: "var(--series-2)" },
  { key: "retirement", label: "Retirement", value: 96_500, color: "var(--series-3)" },
  { key: "property", label: "Home & vehicles", value: 312_000, color: "var(--series-4)" },
];

/** A gentle 12-month upward path ending at `end`, for the sample trend. */
function sampleTrend(end: number): { month: string; netWorth: number }[] {
  const base = end > 0 ? end : 286_000;
  return Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    const wobble = Math.sin(i * 1.7) * 0.012 + Math.cos(i * 0.9) * 0.008;
    return { month: `M${i + 1}`, netWorth: Math.round(base * (0.86 + 0.14 * t + wobble * (1 - t))) };
  });
}

export function NetWorthHero({ d }: { d: DashboardData }) {
  const s = d.foundation.summary;
  const realHistory = d.foundation.history.length >= 2;
  const empty = s.assets.total === 0 && s.debt.total === 0;
  const history = realHistory ? d.foundation.history : sampleTrend(empty ? 0 : s.netWorth);
  const value = empty ? history[history.length - 1].netWorth : s.netWorth;
  const prev = realHistory ? history[history.length - 2].netWorth : null;
  const change = prev != null ? s.netWorth - prev : null;

  const realParts = COMPOSITION.map((c) => ({ ...c, value: d.foundation.assets.filter((a) => c.types.includes(a.type)).reduce((t, a) => t + a.value, 0) })).filter(
    (c) => c.value > 0
  );
  const parts = empty ? SAMPLE_PARTS : realParts;
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  const [hoverPart, setHoverPart] = useState<string | null>(null);

  return (
    <section className="rise-in relative overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <div className="desk-grid absolute inset-0 opacity-60" aria-hidden />
      <div className="glow-drift pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-accent/25 blur-3xl" aria-hidden />
      <div
        className="glow-drift pointer-events-none absolute -bottom-40 left-10 h-72 w-72 rounded-full bg-success/15 blur-3xl"
        style={{ animationDelay: "-6s" }}
        aria-hidden
      />
      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-6 p-6">
        <div className="flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">Net worth</p>
              {empty && <SampleBadge />}
            </div>
            <CountUp value={value} format={money0} className={`block mt-2 text-5xl font-semibold tracking-tight ${value < 0 ? "text-danger" : ""}`} duration={1400} />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {change != null ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${
                    change >= 0 ? "bg-success/12 text-success" : "bg-danger/12 text-danger"
                  }`}
                >
                  {change >= 0 ? "▲" : "▼"} {fmtMoney(Math.abs(change))}
                </span>
              ) : null}
              <span className="text-muted">{change != null ? "since last month" : empty ? "Add your accounts to see yours" : "Your trend builds monthly"}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Assets" value={empty ? total : s.assets.total} />
            <MiniStat label="Debt" value={empty ? 41_300 : s.debt.total} tone="text-danger" />
          </div>

          {parts.length > 0 && (
            <div className="space-y-2">
              <div className="flex h-3.5 w-full gap-0.5" role="img" aria-label="What your assets are made of">
                {parts.map((p, i) => (
                  <span
                    key={p.key}
                    onPointerEnter={() => setHoverPart(p.key)}
                    onPointerLeave={() => setHoverPart(null)}
                    className="grow-x h-full rounded-full transition-[opacity,transform] duration-200 first:rounded-l-full last:rounded-r-full cursor-default"
                    style={{
                      width: `${(p.value / total) * 100}%`,
                      background: p.color,
                      opacity: hoverPart && hoverPart !== p.key ? 0.35 : 1,
                      transform: hoverPart === p.key ? "scaleY(1.35)" : undefined,
                      ["--d" as string]: `${200 + i * 90}ms`,
                    }}
                    title={`${p.label} ${fmtMoney(p.value)} · ${fmtPct(p.value / total)}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {parts.map((p) => (
                  <span
                    key={p.key}
                    onPointerEnter={() => setHoverPart(p.key)}
                    onPointerLeave={() => setHoverPart(null)}
                    className={`inline-flex items-center gap-1.5 transition-opacity ${hoverPart && hoverPart !== p.key ? "opacity-40" : ""}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                    <span className="text-muted">{p.label}</span>
                    <span className="num font-semibold">{short(p.value)}</span>
                    {hoverPart === p.key && <span className="text-muted num">· {fmtPct(p.value / total)}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative flex min-h-[220px] flex-col">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
            <span className="uppercase tracking-[0.12em] font-semibold">{realHistory ? `Last ${history.length} months` : "12-month trend"}</span>
            {!realHistory && <SampleBadge />}
          </div>
          <TrendChart points={history} sample={!realHistory} />
          <div className="mt-3 flex justify-end">
            <Link href="/foundation/net-worth" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:gap-2 transition-all">
              See the full balance sheet <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 px-3 py-2 backdrop-blur-sm">
      <p className="text-[11px] text-muted">{label}</p>
      <CountUp value={value} format={money0} className={`block text-base font-semibold ${tone}`} />
    </div>
  );
}

/** Interactive area chart: hover for each month's value. Draws its line in on mount. */
function TrendChart({ points, sample }: { points: { month: string; netWorth: number }[]; sample: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const values = points.map((p) => p.netWorth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * W;
  const y = (v: number) => H - 14 - ((v - min) / span) * (H - 40);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.netWorth).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  const color = sample ? "var(--accent)" : up ? "var(--success)" : "var(--danger)";
  const label = (m: string) => (/^\d{4}-\d{2}$/.test(m) ? fmtMonth(m) : `Month ${m.slice(1)}`);
  const hi = hover ?? points.length - 1;

  return (
    <div className="relative flex-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full min-h-[180px] w-full overflow-visible"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (points.length - 1)));
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Net worth trend"
      >
        <defs>
          <linearGradient id="nw-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#nw-fill)" className="rise-in" style={{ animationDelay: "500ms" }} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={sample ? undefined : undefined}
          pathLength={1}
          className="sweep"
          style={{ ["--len" as string]: 1, animationDuration: "1.6s" }}
          vectorEffect="non-scaling-stroke"
        />
        <line x1={x(hi)} x2={x(hi)} y1={0} y2={H} stroke="var(--muted)" strokeOpacity={hover != null ? 0.45 : 0} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <circle cx={x(hi)} cy={y(points[hi].netWorth)} r="5" fill={color} stroke="var(--card)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {hover == null && <circle cx={x(hi)} cy={y(points[hi].netWorth)} r="5" fill={color} className="live-ping" style={{ transformOrigin: `${x(hi)}px ${y(points[hi].netWorth)}px` }} />}
      </svg>
      <div
        className="pointer-events-none absolute -top-1 -translate-x-1/2 rounded-lg border border-border bg-card/95 px-2.5 py-1 text-xs shadow-card whitespace-nowrap transition-[left] duration-150"
        style={{ left: `${Math.min(88, Math.max(12, (hi / Math.max(1, points.length - 1)) * 100))}%` }}
      >
        <span className="text-muted">{label(points[hi].month)}</span> <span className="num font-semibold">{fmtMoney(points[hi].netWorth)}</span>
      </div>
    </div>
  );
}

// ─── Quick actions ───────────────────────────────────────────

const ACTIONS = [
  { href: "/traders-corner", label: "Start today's routine", icon: ListChecks },
  { href: "/foundation/advisor", label: "Ask the advisor", icon: Sparkles },
  { href: "/foundation/debt", label: "Update a balance", icon: CreditCard },
  { href: "/foundation/budget", label: "Add a bill", icon: Receipt },
  { href: "/traders-corner/economy", label: "Economy", icon: Landmark },
];

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((a, i) => (
        <Link
          key={a.href}
          href={a.href}
          className="lift rise-in stagger group inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium shadow-card hover:border-accent/50"
          style={{ ["--i" as string]: i + 2 }}
        >
          <a.icon className="w-4 h-4 text-accent transition-transform group-hover:scale-110" />
          {a.label}
        </Link>
      ))}
    </div>
  );
}

// ─── Attention ───────────────────────────────────────────────

const SEVERITY = {
  danger: { icon: AlertOctagon, text: "text-danger", bar: "bg-danger", chip: "bg-danger/12" },
  warning: { icon: AlertTriangle, text: "text-warning", bar: "bg-warning", chip: "bg-warning/15" },
  info: { icon: Info, text: "text-accent", bar: "bg-accent", chip: "bg-accent/12" },
} as const;

export function AttentionList({ items }: { items: AttentionItem[] }) {
  const urgent = items.filter((i) => i.severity === "danger").length;
  return (
    <section className="rise-in rounded-2xl border border-border bg-card shadow-card p-4" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em]">Needs your attention</h2>
        {items.length > 0 && (
          <span className={`num rounded-full px-2 py-0.5 text-[11px] font-semibold ${urgent ? "bg-danger/12 text-danger" : "bg-border/70 text-muted"}`}>{items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-success">
          <CheckCircle2 className="w-5 h-5" />
          All clear. Nothing needs your attention right now.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((i, n) => {
            const S = SEVERITY[i.severity];
            return (
              <li key={i.key} className="rise-in stagger" style={{ ["--i" as string]: n + 2 }}>
                <Link href={i.href} className="group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-card-hover">
                  <span className={`absolute inset-y-1.5 left-0 w-1 rounded-full ${S.bar}`} />
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${S.chip} ${i.severity === "danger" ? "pulse-ring" : ""}`}>
                    <S.icon className={`w-4 h-4 ${S.text}`} aria-label={i.severity} />
                  </span>
                  <span className="flex-1">{i.message}</span>
                  <ArrowRight className="w-4 h-4 text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Snapshot cards ──────────────────────────────────────────

function SnapshotShell({
  title,
  icon: Icon,
  href,
  sample,
  cta,
  delay,
  children,
}: {
  title: string;
  icon: typeof Layers;
  href: string;
  sample?: boolean;
  cta?: ReactNode;
  delay: number;
  children: ReactNode;
}) {
  return (
    <section className="lift rise-in relative overflow-hidden rounded-2xl border border-border bg-card shadow-card p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/10 text-accent">
          <Icon className="w-4 h-4" />
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {sample && <SampleBadge />}
        <Link href={href} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-accent hover:gap-2 transition-all">
          Open <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className={sample ? "pointer-events-none select-none opacity-60 saturate-[0.8]" : ""}>{children}</div>
      {sample && cta && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
          {cta}
        </div>
      )}
    </section>
  );
}

function Tile({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <div className="mt-0.5">{children}</div>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

const SAMPLE_FOUNDATION = { left: 1_840, rate: 0.23, interest: 612, interestYear: 7_344, debtFree: "2029-06", months: 33, ef: 0.62, gap: 5_200 };

export function FoundationSnapshot({ d }: { d: DashboardData }) {
  const f = d.foundation;
  const s = f.summary;
  const sample = !f.ready;
  const v = sample
    ? SAMPLE_FOUNDATION
    : {
        left: s.cashFlow.monthly,
        rate: s.cashFlow.savingsRate ?? 0,
        interest: s.debt.interestMonthly,
        interestYear: s.debt.interestYearly,
        debtFree: s.debt.debtFreeDate,
        months: s.debt.items.length && s.debt.debtFreeDate ? monthsUntil(d.today, s.debt.debtFreeDate) : null,
        ef: s.emergencyFund.target > 0 ? s.emergencyFund.saved / s.emergencyFund.target : 0,
        gap: s.emergencyFund.gap,
      };
  const noDebt = !sample && s.debt.items.length === 0;

  return (
    <SnapshotShell
      title="Foundation"
      icon={Layers}
      href="/foundation"
      sample={sample}
      delay={220}
      cta={
        <>
          <span className="text-sm">See your real numbers here.</span>
          <Link href="/foundation">
            <Button size="sm">Set up Foundation</Button>
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <Tile label="Left over each month">
          <CountUp value={v.left} format={money0} className={`text-xl font-semibold ${v.left >= 0 ? "text-success" : "text-danger"}`} />
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border/70">
            <div className="grow-x h-full rounded-full bg-success" style={{ width: `${Math.max(0, Math.min(1, v.rate)) * 100}%`, ["--d" as string]: "400ms" }} />
          </div>
          <p className="mt-1 text-[11px] text-muted">{fmtPct(v.rate)} of take-home</p>
        </Tile>
        <Tile label="Interest to lenders" sub={`${fmtMoney(v.interestYear)} a year`}>
          <span className="inline-flex items-baseline gap-1">
            <CountUp value={v.interest} format={money0} className={`text-xl font-semibold ${v.interest > 0 ? "text-danger" : ""}`} />
            <span className="text-xs text-muted">/mo</span>
          </span>
        </Tile>
        <Tile label="Debt-free" sub={noDebt ? "Nothing owed" : v.months != null ? `${v.months} months away` : "Not at current payments"}>
          <span className="text-xl font-semibold num">{noDebt ? "Now 🎉" : v.debtFree ? fmtMonth(v.debtFree) : "—"}</span>
        </Tile>
        <Tile label="Emergency fund">
          <div className="flex items-center gap-3">
            <ProgressRing value={v.ef} size={52} stroke={6} color={v.ef >= 1 ? "var(--success)" : "var(--accent)"} label={`Emergency fund ${fmtPct(v.ef)} funded`}>
              <span className="num text-[11px] font-semibold">{fmtPct(Math.min(1, v.ef))}</span>
            </ProgressRing>
            <span className="text-[11px] text-muted">{v.gap > 0 ? `${fmtMoney(v.gap)} to go` : "Fully funded"}</span>
          </div>
        </Tile>
      </div>
      {!sample && f.businessNet != null && (
        <p className="mt-2.5 flex justify-between text-xs">
          <span className="text-muted">Business net (avg / mo)</span>
          <span className="num font-semibold">{fmtMoney(f.businessNet)}</span>
        </p>
      )}
    </SnapshotShell>
  );
}

function monthsUntil(today: string, ym: string) {
  const [ty, tm] = today.split("-").map(Number);
  const [y, m] = ym.split("-").map(Number);
  return Math.max(0, (y - ty) * 12 + (m - tm));
}

const BIAS_STYLE: Record<string, string> = {
  BULLISH: "bg-success/12 text-success",
  BEARISH: "bg-danger/12 text-danger",
  NEUTRAL: "bg-warning/15 text-warning",
};

export function TradersSnapshot({ d }: { d: DashboardData }) {
  const { data, series } = useLive();
  const inv = d.investing;
  const sample = inv.accounts.length === 0;
  const countdown = useCountdown(d.nextEvent?.date ?? null, d.nextEvent?.time ?? null);
  const invested = sample ? 214_800 : inv.invested;
  const pct = sample ? 0.62 : inv.dayChangePct;
  const markets = [
    { sym: "SPY", label: "S&P 500" },
    { sym: "^TNX", label: "10Y yield" },
    { sym: "^VIX", label: "VIX" },
  ];

  return (
    <SnapshotShell
      title="Trader's Corner"
      icon={CandlestickChart}
      href="/traders-corner"
      sample={sample}
      delay={300}
      cta={
        <>
          <span className="text-sm">Track your portfolio and option income.</span>
          <Link href="/accounts">
            <Button size="sm">
              <PlusCircle className="w-4 h-4" />
              Add an account
            </Button>
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
        <Tile label="Invested · live accounts">
          <div className="flex flex-wrap items-center gap-2">
            <CountUp value={invested} format={money0} className="text-xl font-semibold" />
            <Flash value={pct}>
              <DeltaChip pct={pct} size="xs" />
            </Flash>
          </div>
        </Tile>
        <Link href="/traders-corner" className="rounded-xl border border-border bg-background/50 px-3 py-2 hover:border-accent/40 transition-colors">
          <div className="flex items-center gap-2.5">
            <ProgressRing value={d.routine.done / d.routine.total} size={48} stroke={5} color={d.routine.done === d.routine.total ? "var(--success)" : "var(--accent)"} label={`Routine ${d.routine.done} of ${d.routine.total}`}>
              <span className="num text-[11px] font-semibold">
                {d.routine.done}/{d.routine.total}
              </span>
            </ProgressRing>
            <div className="text-[11px]">
              <p className="text-muted">Today&apos;s routine</p>
              <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 font-semibold ${d.routine.bias ? BIAS_STYLE[d.routine.bias] : "bg-border/70 text-muted"}`}>
                {d.routine.bias ? d.routine.bias.charAt(0) + d.routine.bias.slice(1).toLowerCase() : "Bias not set"}
              </span>
            </div>
          </div>
        </Link>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {markets.map((m) => {
          const q = data?.quotes[m.sym];
          const pts = series[m.sym.toUpperCase()] ?? [];
          return (
            <div key={m.sym} className="rounded-xl border border-border bg-background/50 px-2.5 py-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-muted truncate">{m.label}</span>
                {q?.changePct != null && <DeltaChip pct={q.changePct} size="xs" />}
              </div>
              {q?.price != null ? (
                <Flash value={q.price} className="block">
                  <span className="num text-sm font-semibold">{m.sym === "^TNX" ? `${q.price.toFixed(2)}%` : fmtPrice(q.price)}</span>
                </Flash>
              ) : (
                <div className="mt-1 h-4 w-12 rounded bg-border/50 animate-pulse" />
              )}
              <Sparkline points={pts} baseline={q?.previousClose} width={100} height={20} className="mt-0.5 w-full" />
            </div>
          );
        })}
      </div>

      {d.nextEvent && (
        <Link
          href="/traders-corner/economy"
          className="mt-2.5 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs hover:bg-warning/15 transition-colors"
        >
          <CalendarClock className="w-4 h-4 text-warning shrink-0" />
          <span className="font-semibold truncate">{d.nextEvent.label}</span>
          <span className="ml-auto num whitespace-nowrap text-muted">
            {countdown ?? d.nextEvent.time}
            {d.nextEvent.forecast ? ` · exp ${d.nextEvent.forecast}` : ""}
          </span>
        </Link>
      )}

      {!sample && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {inv.accounts.map((a) => (
            <Link key={a.id} href={`/accounts/${a.id}`} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-card-hover hover:border-accent/40 transition-colors">
              {a.name} <span className="num text-muted">{short(a.value)}</span>
              {a.mode === "SIMULATED" && <span className="text-warning"> · sim</span>}
            </Link>
          ))}
        </div>
      )}
    </SnapshotShell>
  );
}

// ─── Investing this year ─────────────────────────────────────

const SOURCE_COLOR: Record<CashSource, string> = {
  COVERED_CALLS: "var(--series-1)",
  CASH_SECURED_PUTS: "var(--series-2)",
  CREDIT_SPREADS: "var(--series-3)",
  CONDORS_STRANGLES: "var(--series-4)",
  OTHER_OPTIONS: "var(--series-5)",
  DIVIDENDS: "var(--series-6)",
};
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Illustrative year for accounts with no option or dividend history yet. */
function sampleYear(base: InvestingYear): InvestingYear {
  const cur = base.months.findIndex((m) => m.toDate);
  const months = base.months.map((m, i) => {
    const bySource = {
      COVERED_CALLS: 380 + i * 22 + (i % 3) * 40,
      CASH_SECURED_PUTS: 260 + (i % 4) * 35,
      CREDIT_SPREADS: i % 2 ? 180 : 90,
      CONDORS_STRANGLES: i % 3 === 0 ? 260 : 0,
      OTHER_OPTIONS: i === 5 ? -120 : 0,
      DIVIDENDS: i % 3 === 2 ? 210 : 70,
    } as Record<CashSource, number>;
    const total = Object.values(bySource).reduce((a, b) => a + b, 0);
    const cost = [0, 2400, 0, 5200, 0, 0, 3100, 0, 4300, 0, 0, 0][i];
    return { ...m, bySource, total, shares: { cost, premiumCost: Math.round(cost * 0.55), cashCost: Math.round(cost * 0.45), symbols: cost ? [{ symbol: "KO", shares: 40 }] : [] } };
  });
  const ytd = months.filter((m) => !m.projected).reduce((s, m) => s + m.total, 0);
  const all = months.reduce((s, m) => s + m.total, 0);
  const ytdBySource = Object.fromEntries(CASH_SOURCES.map((s) => [s, months.filter((m) => !m.projected).reduce((t, m) => t + m.bySource[s], 0)])) as Record<CashSource, number>;
  const cost = months.reduce((s, m) => s + m.shares.cost, 0);
  const premium = months.reduce((s, m) => s + m.shares.premiumCost, 0);
  return { ...base, months, ytd, projectedYear: cur >= 0 ? all : ytd, ytdBySource, shares: { cost, premiumCost: premium, premiumPct: cost ? premium / cost : null } };
}

export function InvestingYearPanel({ y: real }: { y: InvestingYear }) {
  const isEmpty = real.ytd === 0 && real.shares.cost === 0 && real.months.every((m) => m.total === 0);
  const y = useMemo(() => (isEmpty ? sampleYear(real) : real), [isEmpty, real]);
  const [table, setTable] = useState(false);
  const [withProjection, setWithProjection] = useState(true);
  const [hidden, setHidden] = useState<Set<CashSource>>(new Set());
  const projectedFrom = y.months.findIndex((m) => m.projected);
  const firstProjected = projectedFrom === -1 ? 12 : projectedFrom;
  const available = CASH_SOURCES.filter((s) => y.months.some((m) => m.bySource[s] !== 0));
  const sources = available.length ? available : CASH_SOURCES.slice(0, 2);
  const visible = sources.filter((s) => !hidden.has(s));
  const toggle = (s: CashSource) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(s)) next.delete(s);
      else if (visible.length > 1) next.add(s);
      return next;
    });
  const valuesFor = (s: CashSource) => y.months.map((m, i) => (!withProjection && i >= firstProjected ? 0 : m.bySource[s]));
  const hasShares = y.months.some((m) => m.shares.cost > 0);

  return (
    <section className="rise-in rounded-2xl border border-border bg-card shadow-card p-5 space-y-5" style={{ animationDelay: "380ms" }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em]">Investment cash flow · {y.year}</h2>
            {isEmpty && <SampleBadge />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>
              <CountUp value={y.ytd} format={money0} className="text-3xl font-semibold tracking-tight" />
              <span className="ml-1.5 text-sm text-muted">so far</span>
            </span>
            {withProjection && (
              <span className="text-sm text-muted">
                on pace for <CountUp value={y.projectedYear} format={money0} className="font-semibold text-foreground" /> in {y.year}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="radiogroup" aria-label="Projection">
            {[
              { v: true, l: "With projection" },
              { v: false, l: "Actual only" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                role="radio"
                aria-checked={withProjection === o.v}
                onClick={() => setWithProjection(o.v)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${withProjection === o.v ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground">
            <Table2 className="w-3.5 h-3.5" />
            {table ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Show or hide sources">
        {sources.map((s) => {
          const on = !hidden.has(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
                on ? "border-border bg-background/60 hover:border-accent/40" : "border-dashed border-border text-muted opacity-60 hover:opacity-100"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-sm transition-transform" style={{ background: SOURCE_COLOR[s], transform: on ? "scale(1)" : "scale(0.6)" }} />
              {SOURCE_LABEL[s]}
              <span className="num font-semibold">{short(y.ytdBySource[s])}</span>
            </button>
          );
        })}
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs num min-w-[760px]">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium py-1">Month</th>
                {visible.map((s) => (
                  <th key={s} className="text-right font-medium py-1">
                    {SOURCE_LABEL[s]}
                  </th>
                ))}
                <th className="text-right font-medium py-1">Total</th>
                <th className="text-right font-medium py-1">Shares added</th>
              </tr>
            </thead>
            <tbody>
              {y.months.map((m, i) => (
                <tr key={m.month} className={`border-t border-border/60 ${m.projected ? "text-muted italic" : ""}`}>
                  <td className="py-1">
                    {MONTH_LABELS[i]}
                    {m.projected ? " (proj.)" : m.toDate ? " (to date)" : ""}
                  </td>
                  {visible.map((s) => (
                    <td key={s} className="text-right py-1">
                      {fmtMoney(m.bySource[s])}
                    </td>
                  ))}
                  <td className="text-right py-1 font-semibold">{fmtMoney(visible.reduce((t, s) => t + m.bySource[s], 0))}</td>
                  <td className="text-right py-1">{m.projected ? "—" : fmtMoney(m.shares.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <StackedBars
          animKey={`${visible.join(",")}:${withProjection}`}
          ariaLabel="Investment cash flow by month and source"
          labels={MONTH_LABELS}
          projectedFrom={withProjection ? firstProjected : 12}
          height={260}
          series={visible.map((s) => ({ key: s, label: SOURCE_LABEL[s], color: SOURCE_COLOR[s], values: valuesFor(s) }))}
          format={short}
          tooltip={(i) => {
            const m = y.months[i];
            const total = visible.reduce((t, s) => t + m.bySource[s], 0);
            return (
              <div className="space-y-0.5 min-w-[200px]">
                <div className="font-semibold">
                  {MONTH_LABELS[i]} {y.year}
                  <span className="font-normal text-muted">{m.projected ? " · projected" : m.toDate ? " · to date" : ""}</span>
                </div>
                {visible.map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-sm" style={{ background: SOURCE_COLOR[s] }} />
                    <span className="text-muted">{SOURCE_LABEL[s]}</span>
                    <span className="num ml-auto pl-3">{fmtMoney(m.bySource[s])}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-0.5 font-semibold">
                  <span>Total</span>
                  <span className="num">{fmtMoney(total)}</span>
                </div>
                {!m.projected && (m.deposits || m.stockBought || m.stockSold || m.fees) ? (
                  <div className="text-muted pt-0.5">
                    Deposits {fmtMoney(m.deposits)} · Bought {fmtMoney(m.stockBought)} · Sold {fmtMoney(m.stockSold)} · Fees {fmtMoney(m.fees)}
                  </div>
                ) : null}
              </div>
            );
          }}
        />
      )}
      <p className="text-[11px] text-muted">
        {isEmpty
          ? "Sample data: your own option income and dividends appear here as you trade."
          : `Option income is net premium (credits − buy-backs) in the month the cash moved. Projections use your last 3 months per strategy and dividends from current holdings${
              y.dividendBasis === "average" ? " (recent average: no dividend rates found)" : ""
            }. Estimates only.`}
      </p>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em]">Shares added · {y.year}</h3>
          <p className="text-sm">
            <CountUp value={y.shares.cost} format={money0} className="font-semibold" /> of new shares
            {y.shares.premiumPct != null && (
              <span className="text-muted">
                {" "}
                · <span className="text-foreground font-semibold">{fmtPct(y.shares.premiumPct)}</span> paid with premium
              </span>
            )}
          </p>
        </div>
        {hasShares ? (
          <>
            <BarLegend
              items={[
                { label: "Paid with premium", color: "var(--series-3)", value: short(y.shares.premiumCost) },
                { label: "New cash", color: "var(--muted)", value: short(y.shares.cost - y.shares.premiumCost) },
              ]}
            />
            <StackedBars
              ariaLabel="Cost of shares added by month"
              labels={MONTH_LABELS}
              projectedFrom={MONTH_LABELS.length}
              height={170}
              series={[
                { key: "premium", label: "Paid with premium", color: "var(--series-3)", values: y.months.map((m) => m.shares.premiumCost) },
                { key: "cash", label: "New cash", color: "var(--muted)", values: y.months.map((m) => m.shares.cashCost) },
              ]}
              format={short}
              tooltip={(i) => {
                const m = y.months[i];
                return (
                  <div className="space-y-0.5">
                    <div className="font-semibold">
                      {MONTH_LABELS[i]} {y.year}
                    </div>
                    {m.shares.symbols.length ? <div>{m.shares.symbols.map((s) => `+${s.shares} ${s.symbol}`).join(", ")}</div> : <div className="text-muted">No new shares</div>}
                    {m.shares.cost > 0 && (
                      <div className="text-muted">
                        {fmtMoney(m.shares.cost)} · {fmtMoney(m.shares.premiumCost)} from premium
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </>
        ) : (
          <p className="text-sm text-muted">No new shares bought this year yet.</p>
        )}
      </div>
    </section>
  );
}
