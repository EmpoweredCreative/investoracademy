"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, ArrowUpRight, Link2, RefreshCw, Wallet } from "lucide-react";
import { BUCKET_COLORS, BUCKET_LABELS, BUCKET_OPTIONS, BUCKET_SHORT_LABELS, type Bucket } from "@/lib/buckets";
import { useLive, type ActivityItem, type LiveAccount } from "@/components/live/LiveProvider";
import { KIND_STYLE } from "@/components/live/StatusBar";
import {
  AnimatedNumber,
  DeltaChip,
  Flash,
  LiveDot,
  Panel,
  Sparkline,
  fmtPct,
  fmtPrice,
  fmtSigned,
  fmtUsd,
} from "@/components/live/primitives";

// ─── Portfolio curve ─────────────────────────────────────────

/** Today's account value curve: cash + Σ shares × intraday price, aligned from the latest bar. */
function usePortfolioCurve(account: LiveAccount | null) {
  const { series } = useLive();
  return useMemo(() => {
    if (!account) return [];
    const withShares = account.holdings.filter((h) => h.shares > 0);
    const legs = withShares
      .map((h) => ({ shares: h.shares, pts: series[h.symbol.toUpperCase()] ?? [] }))
      .filter((l) => l.pts.length > 1);
    if (legs.length === 0) return [];
    const len = Math.min(...legs.map((l) => l.pts.length));
    const unmarked = withShares
      .filter((h) => (series[h.symbol.toUpperCase()]?.length ?? 0) <= 1)
      .reduce((s, h) => s + h.value, 0);
    const base = account.cash + account.reserve + unmarked;
    return Array.from({ length: len }, (_, i) =>
      legs.reduce((sum, l) => sum + l.shares * l.pts[l.pts.length - len + i], base)
    );
  }, [account, series]);
}

// ─── Hero ────────────────────────────────────────────────────

export function NetLiqHero({ account }: { account: LiveAccount }) {
  const curve = usePortfolioCurve(account);
  const { data } = useLive();
  const isOpen = data?.market.phase === "OPEN";

  return (
    <section className="rise-in relative overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="desk-grid absolute inset-0 opacity-70" aria-hidden />
      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 p-6">
        <div className="flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted font-semibold">
              <Wallet className="w-3.5 h-3.5" />
              Net liquidation
              {isOpen && (
                <span className="flex items-center gap-1.5 normal-case tracking-normal text-success font-medium">
                  <LiveDot /> marking live
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-1 text-foreground">
              <AnimatedNumber value={account.netLiq} format={(n) => fmtUsd(n)} className="text-4xl xl:text-5xl font-semibold tracking-tight" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DeltaChip value={account.dayChange} pct={account.dayChangePct} size="md" />
              <span className="text-xs text-muted">today</span>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-xs">
            <Stat label="Cash" value={fmtUsd(account.cash + account.reserve, 0)} />
            <Stat label="Invested" value={fmtUsd(account.holdingsValue, 0)} />
            <Stat
              label="Unrealized"
              value={fmtSigned(account.unrealized, 0)}
              tone={account.unrealized >= 0 ? "text-success" : "text-danger"}
            />
          </dl>
        </div>
        <div className="min-h-[140px] flex flex-col">
          <div className="flex items-center justify-between text-[11px] text-muted mb-1">
            <span className="uppercase tracking-[0.12em] font-semibold">Intraday</span>
            <span className="num">{curve.length > 1 ? `${curve.length} marks` : "waiting for marks"}</span>
          </div>
          {curve.length > 1 ? (
            <AreaChart points={curve} />
          ) : (
            <div className="flex-1 grid place-items-center text-xs text-muted border border-dashed border-border rounded-xl">
              Add positions to see today&apos;s curve
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className={`num font-semibold text-sm mt-0.5 ${tone}`}>{value}</dd>
    </div>
  );
}

/** Responsive glowing area chart for the hero. */
function AreaChart({ points }: { points: number[] }) {
  const W = 600;
  const H = 160;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 8 - ((v - min) / span) * (H - 20);
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  const color = up ? "var(--success)" : "var(--danger)";
  const lx = x(points.length - 1);
  const ly = y(points[points.length - 1]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full flex-1 min-h-[140px] overflow-visible">
      <defs>
        <linearGradient id="hero-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id="hero-glow" x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <line x1="0" x2={W} y1={y(points[0])} y2={y(points[0])} stroke="var(--muted)" strokeOpacity="0.3" strokeDasharray="3 4" />
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#hero-fill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" filter="url(#hero-glow)" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="4" fill={color} />
      <circle cx={lx} cy={ly} r="4" fill={color} className="live-ping" style={{ transformOrigin: `${lx}px ${ly}px` }} />
    </svg>
  );
}

// ─── Bucket strip ────────────────────────────────────────────

export function BucketStrip({ account, accountId }: { account: LiveAccount; accountId: string }) {
  const hrefs: Record<Bucket, string> = {
    CORE: `/accounts/${accountId}/core`,
    SPECULATION: `/accounts/${accountId}/journal`,
    RISK_FREE_MONEY: `/accounts/${accountId}/wheel`,
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {account.buckets.map((b, i) => {
        const color = BUCKET_COLORS[b.bucket];
        const drift = b.actualPct - b.targetPct;
        return (
          <Link
            key={b.bucket}
            href={hrefs[b.bucket]}
            className="rise-in group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card hover:-translate-y-0.5 transition-transform"
            style={{ animationDelay: `${80 + i * 60}ms` }}
          >
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.12em] font-semibold" style={{ color }}>
                {BUCKET_LABELS[b.bucket]}
              </span>
              <ArrowUpRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <AnimatedNumber value={b.value} format={(n) => fmtUsd(n, 0)} className="block mt-1 text-2xl font-semibold" />
            <div className="mt-3 relative h-2 rounded-full bg-border/70 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                style={{ width: `${Math.min(100, b.actualPct)}%`, background: color }}
              />
              <div
                className="absolute inset-y-[-3px] w-0.5 bg-foreground/70"
                style={{ left: `${Math.min(100, b.targetPct)}%` }}
                title={`Target ${b.targetPct}%`}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="num text-foreground">{b.actualPct.toFixed(1)}%</span>
              <span className="text-muted">
                target {b.targetPct}% ·{" "}
                <span className={Math.abs(drift) < 2 ? "text-muted" : drift > 0 ? "text-warning" : "text-accent"}>
                  {drift > 0 ? "over" : "under"} {Math.abs(drift).toFixed(1)}%
                </span>
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Holdings board ──────────────────────────────────────────

export function HoldingsBoard({ account }: { account: LiveAccount }) {
  const { series, data } = useLive();
  const rows = account.holdings;

  return (
    <Panel
      title="Positions"
      subtitle={`${rows.length} symbols`}
      right={
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <LiveDot pulse={data?.market.phase === "OPEN"} tone={data?.market.phase === "OPEN" ? "success" : "muted"} />
          {data?.market.phase === "OPEN" ? "streaming marks" : "last close"}
        </span>
      }
      bodyClassName="overflow-x-auto"
    >
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted">No open positions yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted">
              <th className="text-left font-semibold px-4 py-2">Symbol</th>
              <th className="text-left font-semibold px-2 py-2 hidden md:table-cell">Today</th>
              <th className="text-right font-semibold px-2 py-2">Last</th>
              <th className="text-right font-semibold px-2 py-2">Chg</th>
              <th className="text-right font-semibold px-2 py-2 hidden sm:table-cell">Shares</th>
              <th className="text-right font-semibold px-2 py-2">Value</th>
              <th className="text-right font-semibold px-4 py-2 hidden lg:table-cell">Unrealized</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const pts = series[h.symbol.toUpperCase()] ?? [];
              const prevClose = data?.quotes[h.symbol.toUpperCase()]?.previousClose ?? null;
              return (
                <tr key={h.underlyingId} className="border-t border-border/70 hover:bg-card-hover transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-1.5 h-6 rounded-full" style={{ background: BUCKET_COLORS[h.bucket] }} title={BUCKET_LABELS[h.bucket]} />
                      <div className="min-w-0">
                        <div className="font-semibold leading-tight">{h.symbol}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted">
                          <BucketPicker accountId={account.id} underlyingId={h.underlyingId} bucket={h.bucket} />
                          {h.openOptions > 0 && <span>· {h.openOptions} option{h.openOptions === 1 ? "" : "s"}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 hidden md:table-cell">
                    <Sparkline points={pts} baseline={prevClose} width={88} height={26} />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {h.price != null ? (
                      <Flash value={h.price}>
                        <span className="num font-medium">{fmtPrice(h.price)}</span>
                      </Flash>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {h.changePct != null ? <DeltaChip pct={h.changePct} size="xs" /> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right num hidden sm:table-cell">{h.shares.toLocaleString()}</td>
                  <td className="px-2 py-2.5 text-right">
                    <AnimatedNumber value={h.value} format={(n) => fmtUsd(n, 0)} className="font-medium" />
                  </td>
                  <td className="px-4 py-2.5 text-right hidden lg:table-cell">
                    {h.unrealized != null ? (
                      <span className={`num ${h.unrealized >= 0 ? "text-success" : "text-danger"}`}>
                        {fmtSigned(h.unrealized, 0)}
                        {h.costBasis > 0 && (
                          <span className="ml-1 text-[11px] opacity-70">{fmtPct((h.unrealized / h.costBasis) * 100, 1)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

// ─── Activity log ────────────────────────────────────────────

export function ActivityLog({ items, title = "Activity", limit = 12 }: { items: ActivityItem[]; title?: string; limit?: number }) {
  const { freshActivity } = useLive();
  return (
    <Panel
      title={title}
      subtitle="trades · cash · alerts"
      right={<Activity className="w-3.5 h-3.5 text-muted" />}
      bodyClassName="max-h-[460px] overflow-y-auto"
    >
      {items.length === 0 ? (
        <p className="p-6 text-sm text-muted">No activity yet.</p>
      ) : (
        <ul>
          {items.slice(0, limit).map((a) => (
            <li
              key={a.id}
              className={`flex items-center gap-3 px-4 py-2 border-b border-border/60 last:border-0 text-xs ${
                freshActivity.has(a.id) ? "slide-in bg-accent/5" : ""
              }`}
            >
              <span className="num text-muted w-12 shrink-0">{relTime(a.at)}</span>
              <span
                className={`rounded px-1.5 py-px text-[10px] font-semibold tracking-wide w-14 text-center shrink-0 ${
                  KIND_STYLE[a.kind] ?? KIND_STYLE.ADJUST
                }`}
              >
                {a.kind}
              </span>
              <span className="flex-1 min-w-0 truncate">
                {a.title}
                {a.account && <span className="text-muted"> · {a.account}</span>}
              </span>
              {a.amount != null && (
                <span className={`num shrink-0 ${a.amount >= 0 ? "text-success" : "text-danger"}`}>{fmtSigned(a.amount)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Market pulse ────────────────────────────────────────────

export function MarketPulse() {
  const { data, series } = useLive();
  const symbols = data?.marketSymbols ?? [];
  return (
    <Panel title="Market pulse" subtitle={data ? `${data.feed.source}${data.feed.delayed ? " · may be delayed" : ""}` : undefined} bodyClassName="p-0">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-border">
        {(symbols.length ? symbols : Array.from({ length: 6 }, (_, i) => ({ symbol: `s${i}`, label: "" }))).map((m) => {
          const q = data?.quotes[m.symbol.toUpperCase()];
          return (
            <div key={m.symbol} className="p-4 bg-card">
              {q?.price != null ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{m.label}</span>
                    {q.changePct != null && <DeltaChip pct={q.changePct} size="xs" />}
                  </div>
                  <Flash value={q.price} className="block mt-1">
                    <span className="num text-lg font-semibold">{fmtPrice(q.price)}</span>
                  </Flash>
                  <Sparkline points={series[m.symbol.toUpperCase()] ?? []} baseline={q.previousClose} width={140} height={32} className="mt-1 w-full" />
                </>
              ) : (
                <div className="h-[78px] animate-pulse rounded-lg bg-border/40" />
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─── Bucket picker ───────────────────────────────────────────

/** Inline bucket selector for a symbol; saves immediately and refreshes the feed. */
function BucketPicker({ accountId, underlyingId, bucket }: { accountId: string; underlyingId: string; bucket: Bucket }) {
  const { refresh } = useLive();
  const [value, setValue] = useState<Bucket>(bucket);
  const [saving, setSaving] = useState(false);
  const [prevBucket, setPrevBucket] = useState(bucket);
  if (bucket !== prevBucket) {
    setPrevBucket(bucket);
    setValue(bucket);
  }

  const change = async (next: Bucket) => {
    setValue(next);
    setSaving(true);
    await fetch(`/api/accounts/${accountId}/wheel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ underlyingId, category: next }),
    });
    setSaving(false);
    refresh();
  };

  return (
    <select
      value={value}
      onChange={(e) => change(e.target.value as Bucket)}
      disabled={saving}
      title="Bucket for this symbol"
      className="bg-transparent border-0 p-0 pr-1 text-[11px] font-medium cursor-pointer hover:text-foreground focus:outline-none focus:ring-0"
      style={{ color: BUCKET_COLORS[value] }}
    >
      {BUCKET_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {BUCKET_SHORT_LABELS[o.value]}
        </option>
      ))}
    </select>
  );
}

// ─── Broker strip ────────────────────────────────────────────

/** Schwab sync status + manual sync for linked accounts; connect prompt otherwise. */
export function BrokerStrip({ accountId }: { accountId: string }) {
  const { data, refresh } = useLive();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sync = data?.account?.id === accountId ? data.sync : null;

  if (!data?.account || data.account.id !== accountId) return null;

  if (!sync) {
    return (
      <div className="rise-in flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-4 py-3 text-sm">
        <span className="text-muted">
          This account uses manually entered data. Connect Schwab to sync real positions, trades and fees automatically.
        </span>
        <Link href="/connect/schwab" className="inline-flex items-center gap-1.5 text-accent font-medium hover:underline">
          <Link2 className="w-4 h-4" /> Connect Schwab
        </Link>
      </div>
    );
  }

  const run = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/accounts/${accountId}/sync`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(res.ok ? `${body.transactionsImported ?? 0} new trades` : body.error ?? "Sync failed");
    refresh();
  };

  const needsReconnect = sync.error?.toLowerCase().includes("reconnect") || sync.error?.includes("expired");
  const syncing = busy || sync.syncing;
  return (
    <div className="rise-in flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-xs shadow-card">
      <span className="flex items-center gap-2 font-semibold">
        <LiveDot tone={needsReconnect ? "danger" : sync.error ? "warning" : "success"} pulse={!sync.error} />
        Schwab
      </span>
      <span className="text-muted">
        {syncing ? "Syncing…" : sync.lastSyncedAt ? `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
      </span>
      {sync.buyingPower != null && (
        <span className="text-muted">
          Buying power <span className="num text-foreground">{fmtUsd(sync.buyingPower, 0)}</span>
        </span>
      )}
      {sync.netLiq != null && (
        <span className="text-muted">
          Schwab net liq <span className="num text-foreground">{fmtUsd(sync.netLiq, 0)}</span>
        </span>
      )}
      {message && <span className="text-muted">· {message}</span>}
      {sync.error && <span className={needsReconnect ? "text-danger" : "text-warning"}>{sync.error}</span>}
      <span className="ml-auto flex items-center gap-2">
        {needsReconnect && (
          <Link href="/connect/schwab" className="text-accent font-medium hover:underline">
            Reconnect
          </Link>
        )}
        <button
          type="button"
          onClick={run}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-medium hover:bg-card-hover disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync now
        </button>
      </span>
    </div>
  );
}

// ─── Account desk (composition) ──────────────────────────────

/** Live overview shown at the top of an account page. */
export function AccountDesk({ accountId }: { accountId: string }) {
  const { data } = useLive();
  const account = data?.account?.id === accountId ? data.account : null;

  if (!account) {
    return (
      <div className="space-y-3">
        <div className="h-[220px] rounded-2xl bg-card border border-border animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[118px] rounded-2xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BrokerStrip accountId={accountId} />
      <NetLiqHero account={account} />
      <BucketStrip account={account} accountId={accountId} />
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4">
        <HoldingsBoard account={account} />
        <ActivityLog items={data?.activity ?? []} />
      </div>
    </div>
  );
}
