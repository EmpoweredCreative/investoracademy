"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { DeltaChip, fmtSigned, fmtUsd } from "@/components/live/primitives";
import { BucketStrip } from "@/components/desk/Desk";
import type { LiveAccount, LiveHolding } from "@/components/live/LiveProvider";
import { StepLabel } from "./StepCard";
import { SICK_DAY_PCT, SICK_UNREALIZED_PCT } from "@/lib/dashboard/attention";


const unrealizedPct = (h: LiveHolding) =>
  h.unrealized != null && h.costBasis > 0 ? (h.unrealized / h.costBasis) * 100 : null;

// ─── Step 3 ──────────────────────────────────────────────────

export function BusinessStep({ account, accountId }: { account: LiveAccount | null; accountId: string }) {
  if (!account) return <div className="h-32 rounded-xl bg-border/30 animate-pulse" />;

  const rows = [...account.holdings]
    .map((h) => ({ h, upct: unrealizedPct(h) }))
    // Sickest first: worst unrealized %, then worst day.
    .sort((a, b) => (a.upct ?? 0) - (b.upct ?? 0) || (a.h.changePct ?? 0) - (b.h.changePct ?? 0));
  const sick = rows.filter((r) => (r.upct ?? 0) <= SICK_UNREALIZED_PCT || (r.h.changePct ?? 0) <= SICK_DAY_PCT);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Today" value={fmtSigned(account.dayChange, 0)} tone={account.dayChange >= 0 ? "text-success" : "text-danger"} />
        <Stat label="Unrealized" value={fmtSigned(account.unrealized, 0)} tone={account.unrealized >= 0 ? "text-success" : "text-danger"} />
        <Stat label="Positions" value={String(account.holdings.length)} />
        <Stat
          label="Need attention"
          value={String(sick.length)}
          tone={sick.length ? "text-warning" : "text-success"}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">No open positions.</p>
      ) : (
        <div>
          <StepLabel right={<span className="text-[11px] text-muted">Sorted sickest first</span>}>Triage</StepLabel>
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <tbody>
                {rows.slice(0, 8).map(({ h, upct }) => {
                  const flagged = (upct ?? 0) <= SICK_UNREALIZED_PCT || (h.changePct ?? 0) <= SICK_DAY_PCT;
                  return (
                    <tr key={h.underlyingId} className="border-b border-border/50 last:border-0">
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-2 font-medium">
                          {flagged && <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                          {h.symbol}
                        </span>
                        {h.openOptions > 0 && (
                          <span className="ml-2 text-[10px] rounded bg-accent/10 text-accent px-1.5 py-0.5">
                            {h.openOptions} option{h.openOptions > 1 ? "s" : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right num">{fmtUsd(h.value, 0)}</td>
                      <td className="py-2 px-3 text-right">{h.changePct != null ? <DeltaChip pct={h.changePct} size="xs" /> : "—"}</td>
                      <td
                        className={`py-2 px-3 text-right num ${
                          (h.unrealized ?? 0) >= 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {h.unrealized != null ? fmtSigned(h.unrealized, 0) : "—"}
                        {upct != null && <span className="ml-1 text-xs opacity-70">({upct.toFixed(1)}%)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <GoLink href={`/accounts/${accountId}`}>Open portfolio</GoLink>
    </div>
  );
}

// ─── Steps 4 & 5 data ────────────────────────────────────────

interface Summary {
  watchlist: { total: number; top: { symbol: string; status: string; score: number | null }[] };
  journal: {
    openTrades: number;
    closedThisWeek: number;
    missingNotes: number;
    recent: { id: string; symbol: string; callPut: string | null; strike: number | null; closed: boolean; updatedAt: string }[];
  };
}

export function useRoutineSummary(accountId: string | null) {
  const [data, setData] = useState<Summary | null>(null);
  const [prevId, setPrevId] = useState(accountId);
  if (accountId !== prevId) {
    setPrevId(accountId);
    setData(null);
  }
  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/routine/summary?accountId=${accountId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json && setData(json))
      .catch(() => {});
  }, [accountId]);
  return data;
}

// ─── Step 4 ──────────────────────────────────────────────────

export function OpportunitiesStep({ summary, accountId }: { summary: Summary | null; accountId: string }) {
  return (
    <div className="space-y-4">
      <div>
        <StepLabel right={summary && <span className="text-[11px] text-muted">{summary.watchlist.total} on watchlist</span>}>
          Watchlist leaders
        </StepLabel>
        {!summary ? (
          <div className="h-16 rounded-xl bg-border/30 animate-pulse" />
        ) : summary.watchlist.top.length === 0 ? (
          <p className="text-sm text-muted">Your watchlist is empty. Run a scan to find candidates.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            {summary.watchlist.top.map((w) => (
              <Link
                key={w.symbol}
                href={`/accounts/${accountId}/fundamentals/${w.symbol}`}
                className="rounded-xl border border-border px-3 py-2 hover:bg-card-hover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{w.symbol}</span>
                  {w.score != null && <span className="num text-xs text-accent">{w.score}</span>}
                </div>
                <div className="text-[10px] text-muted uppercase tracking-wider">{w.status.replace("_", " ").toLowerCase()}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <GoLink href={`/accounts/${accountId}/fundamentals`}>Research & screener</GoLink>
        <GoLink href={`/accounts/${accountId}/research`}>Trade research</GoLink>
        <GoLink href={`/accounts/${accountId}/ai-chart-assist`}>AI chart assist</GoLink>
      </div>
    </div>
  );
}

// ─── Step 5 ──────────────────────────────────────────────────

export function JournalStep({ summary, accountId }: { summary: Summary | null; accountId: string }) {
  if (!summary) return <div className="h-24 rounded-xl bg-border/30 animate-pulse" />;
  const j = summary.journal;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Open trades" value={String(j.openTrades)} />
        <Stat label="Closed this week" value={String(j.closedThisWeek)} />
        <Stat
          label="Missing notes (7d)"
          value={String(j.missingNotes)}
          tone={j.missingNotes ? "text-warning" : "text-success"}
        />
      </div>
      {j.recent.length > 0 && (
        <div>
          <StepLabel>Recently updated</StepLabel>
          <ul className="rounded-xl border border-border divide-y divide-border text-sm">
            {j.recent.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                <span className="font-medium">{t.symbol}</span>
                <span className="text-xs text-muted">
                  {t.strike != null ? `$${t.strike}` : ""} {t.callPut ?? "Stock"}
                </span>
                <span className={`ml-auto text-[10px] uppercase tracking-wider ${t.closed ? "text-muted" : "text-accent"}`}>
                  {t.closed ? "Closed" : "Open"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <GoLink href={`/accounts/${accountId}/journal`}>Open journal</GoLink>
    </div>
  );
}

// ─── Step 6 ──────────────────────────────────────────────────

export function BlueprintStep({ account, accountId }: { account: LiveAccount | null; accountId: string }) {
  return (
    <div className="space-y-4">
      {account ? <BucketStrip account={account} accountId={accountId} /> : <div className="h-28 rounded-xl bg-border/30 animate-pulse" />}
      <GoLink href={`/accounts/${accountId}/wheel`}>Open Wealth Wheel</GoLink>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`num font-semibold mt-0.5 ${tone}`}>{value}</div>
    </div>
  );
}

function GoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
      {children}
      <ArrowRight className="w-4 h-4" />
    </Link>
  );
}
