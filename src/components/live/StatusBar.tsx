"use client";

import Link from "next/link";
import { Bell, Moon, RefreshCw, Sun } from "lucide-react";
import { formatCountdown, getMarketStatus } from "@/lib/marketClock";
import { useLive, useNow } from "./LiveProvider";
import { DeltaChip, Flash, LiveDot, TickerTape, fmtPrice, fmtSigned } from "./primitives";

const KIND_STYLE: Record<string, string> = {
  CREDIT: "bg-success/12 text-success",
  SELL: "bg-success/12 text-success",
  DEBIT: "bg-danger/12 text-danger",
  BUY: "bg-accent/12 text-accent",
  FEE: "bg-muted/15 text-muted",
  CASH: "bg-core/12 text-core",
  ALERT: "bg-warning/15 text-warning",
  ADJUST: "bg-muted/15 text-muted",
};

export function ThemeToggle() {
  const toggle = () => {
    const next = document.documentElement.dataset.theme !== "dark";
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("wt-theme", next ? "dark" : "light");
    } catch {
      // storage unavailable; theme still applies for this session
    }
  };
  // Icons swap via CSS on :root[data-theme], so there's no hydration mismatch.
  return (
    <button
      type="button"
      onClick={toggle}
      className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
      title="Toggle light / dark"
      aria-label="Toggle theme"
    >
      <Moon className="w-4 h-4 theme-icon-light" />
      <Sun className="w-4 h-4 theme-icon-dark" />
    </button>
  );
}

/** Top bar: ET clock, market session countdown, feed health, theme, alerts. */
export function StatusBar() {
  const { data, status, lastUpdated, refresh } = useLive();
  const now = useNow(1000);
  const market = getMarketStatus(new Date(now));
  const ago = lastUpdated ? Math.max(0, Math.round((now - lastUpdated) / 1000)) : null;

  const feedTone = status === "live" ? "success" : status === "connecting" ? "warning" : "danger";
  const feedLabel =
    status === "live" ? "Live" : status === "connecting" ? "Connecting" : status === "stale" ? "Reconnecting" : "Offline";
  const marketTone = market.phase === "OPEN" ? "success" : market.phase === "CLOSED" ? "muted" : "warning";
  const alerts = data?.activity.filter((a) => a.kind === "ALERT").length ?? 0;

  return (
    <div className="flex items-center gap-4 px-5 h-11 border-b border-border bg-card/80 backdrop-blur-md text-xs">
      <div className="flex items-center gap-2 font-medium">
        <LiveDot tone={marketTone} pulse={market.phase === "OPEN"} />
        <span>{market.label}</span>
        <span className="text-muted num">
          {market.nextLabel} in {formatCountdown(market.msToNext)}
        </span>
      </div>

      <div className="hidden md:flex items-center gap-2 text-muted">
        <span className="h-3 w-px bg-border" />
        <span className="num text-foreground font-semibold tracking-tight">{market.nyTime}</span>
        <span>ET</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {data?.sync && (
          <Link
            href="/connect/schwab"
            className="hidden lg:flex items-center gap-2 rounded-full border border-border px-2.5 py-1 hover:bg-card-hover transition-colors"
            title={data.sync.error ?? "Schwab connection"}
          >
            <LiveDot tone={data.sync.error ? "warning" : "success"} pulse={data.sync.syncing} />
            <span className="font-medium">Schwab</span>
            <span className="text-muted">
              {data.sync.syncing
                ? "syncing"
                : data.sync.lastSyncedAt
                  ? `synced ${Math.max(0, Math.round((now - new Date(data.sync.lastSyncedAt).getTime()) / 60000))}m ago`
                  : "pending"}
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1 hover:bg-card-hover transition-colors"
          title={data ? `${data.feed.source} · ${data.feed.latencyMs}ms · prices may be delayed` : "Market data feed"}
        >
          <LiveDot tone={feedTone} pulse={status === "live"} />
          <span className="font-medium">{feedLabel}</span>
          <span className="text-muted num hidden sm:inline">
            {data?.feed.source ?? "Market data"}
            {ago != null ? ` · ${ago}s ago` : ""}
          </span>
          <RefreshCw className="w-3 h-3 text-muted" />
        </button>
        <ThemeToggle />
        <Link
          href="/notifications"
          className="relative p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {alerts > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-danger" />}
        </Link>
      </div>
    </div>
  );
}

/** Scrolling Live Wire: market quotes, your holdings, and recent account activity. */
export function LiveWire() {
  const { data } = useLive();
  if (!data) {
    return <div className="h-9 border-b border-border bg-card animate-pulse" />;
  }

  const holdings = data.account?.holdings.map((h) => h.symbol.toUpperCase()) ?? [];
  const quoteItems = [
    ...data.marketSymbols.map((m) => ({ key: m.symbol, label: m.label })),
    ...holdings.filter((s) => !data.marketSymbols.some((m) => m.symbol === s)).map((s) => ({ key: s, label: s })),
  ];

  return (
    <div className="flex items-stretch h-9 border-b border-border bg-card text-xs">
      <div className="flex items-center gap-2 px-4 bg-foreground text-background font-semibold tracking-[0.14em] text-[10px] uppercase shrink-0">
        <LiveDot tone="danger" />
        Live wire
      </div>
      <div className="flex-1 min-w-0">
        <TickerTape duration={Math.max(40, quoteItems.length * 6 + data.activity.length * 4)}>
          {quoteItems.map(({ key, label }) => {
            const q = data.quotes[key.toUpperCase()];
            if (!q || q.price == null) return null;
            return (
              <span key={key} className="flex items-center gap-2 px-4 h-9 border-r border-border/60">
                <span className="font-semibold">{label}</span>
                <Flash value={q.price}>
                  <span className="num">{fmtPrice(q.price)}</span>
                </Flash>
                {q.changePct != null && <DeltaChip pct={q.changePct} size="xs" />}
              </span>
            );
          })}
          {data.activity.slice(0, 8).map((a) => (
            <span key={a.id} className="flex items-center gap-2 px-4 h-9 border-r border-border/60">
              <span className={`rounded px-1.5 py-px text-[10px] font-semibold tracking-wide ${KIND_STYLE[a.kind] ?? KIND_STYLE.ADJUST}`}>
                {a.kind}
              </span>
              <span className="max-w-[28ch] truncate">{a.title}</span>
              {a.amount != null && (
                <span className={`num ${a.amount >= 0 ? "text-success" : "text-danger"}`}>{fmtSigned(a.amount)}</span>
              )}
            </span>
          ))}
        </TickerTape>
      </div>
    </div>
  );
}

export { KIND_STYLE };
