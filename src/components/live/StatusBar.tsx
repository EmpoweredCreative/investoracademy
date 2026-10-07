"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, Landmark, Moon, RefreshCw, Sun } from "lucide-react";
import { formatCountdown, getMarketStatus } from "@/lib/marketClock";
import { countdownLabel } from "@/lib/marketdata/etTime";
import { useHydrated } from "@/lib/useHydrated";
import { useLive, useNow } from "./LiveProvider";
import { DeltaChip, Flash, LiveDot, TickerTape, fmtPrice } from "./primitives";

const KIND_STYLE: Record<string, string> = {
  CREDIT: "bg-success/12 text-success",
  SELL: "bg-success/12 text-success",
  DEBIT: "bg-danger/12 text-danger",
  BUY: "bg-accent/12 text-accent",
  FEE: "bg-muted/15 text-muted",
  CASH: "bg-core/12 text-core",
  DIVIDEND: "bg-success/12 text-success",
  INTEREST: "bg-success/12 text-success",
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
  const hydrated = useHydrated();
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
        <span className="text-muted num">{hydrated ? `${market.nextLabel} in ${formatCountdown(market.msToNext)}` : "\u00a0"}</span>
      </div>

      <div className="hidden md:flex items-center gap-2 text-muted">
        <span className="h-3 w-px bg-border" />
        <span className="num text-foreground font-semibold tracking-tight">{hydrated ? market.nyTime : "--:--:--"}</span>
        <span>ET</span>
      </div>

      <EventPill now={now} />

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
/**
 * Scrolling watchlist, broad market to sectors, then the person's own
 * positions. Last price, net change and % change, like a broker watchlist.
 */
export function LiveWire() {
  const { data } = useLive();
  if (!data) {
    return <div className="h-9 border-b border-border bg-card animate-pulse" />;
  }

  const groups = data.wire ?? [{ key: "market", label: "Market", items: data.marketSymbols }];
  const count = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="flex items-stretch h-9 border-b border-border bg-card text-xs">
      <div className="flex items-center gap-2 px-4 bg-foreground text-background font-semibold tracking-[0.14em] text-[10px] uppercase shrink-0">
        <LiveDot tone="danger" />
        Live wire
      </div>
      <div className="flex-1 min-w-0">
        <TickerTape duration={Math.max(45, count * 4)}>
          {groups.map((g) => (
            <span key={g.key} className="flex items-center h-9">
              <span className="mx-2 rounded bg-foreground/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-background">
                {g.label}
              </span>
              {g.items.map(({ symbol, label }) => {
                const q = data.quotes[symbol.toUpperCase()];
                if (!q || q.price == null) return null;
                const up = (q.change ?? 0) >= 0;
                const isYield = symbol === "^TNX";
                return (
                  <span key={symbol} className="flex items-center gap-2 px-3.5 h-9 border-r border-border/60" title={q.name ?? label}>
                    <span className="font-semibold">{label}</span>
                    <Flash value={q.price}>
                      <span className="num">{isYield ? `${q.price.toFixed(3)}%` : fmtPrice(q.price)}</span>
                    </Flash>
                    {q.change != null && (
                      <span className={`num ${up ? "text-success" : "text-danger"}`}>
                        {up ? "+" : "−"}
                        {Math.abs(q.change).toFixed(Math.abs(q.change) < 1 ? 3 : 2)}
                      </span>
                    )}
                    {q.changePct != null && <DeltaChip pct={q.changePct} size="xs" />}
                  </span>
                );
              })}
            </span>
          ))}
        </TickerTape>
      </div>
    </div>
  );
}

export { KIND_STYLE };

interface HeadlineEvent {
  label: string;
  date: string;
  time: string;
  kind: "release" | "fomc";
  at: string;
  forecast?: string | null;
  previous?: string | null;
  actual?: string | null;
}

/** Parse "0.3%", "200K" for comparing actual with expected. */
function num(v: string | null | undefined) {
  const m = v?.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return /K$/i.test(v!) ? n * 1e3 : /M$/i.test(v!) ? n * 1e6 : n;
}

/**
 * Market-moving releases in the top bar, Forex Factory style: a countdown to
 * each one, then the actual vs expected once it's out. Rotates through today's
 * and upcoming events (pauses on hover) and warms up as a release gets close.
 */
function EventPill({ now }: { now: number }) {
  const [events, setEvents] = useState<HeadlineEvent[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/market/next-event")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setEvents(j.events ?? []))
        .catch(() => {});
    load();
    const t = setInterval(load, 3 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Lead with what matters most: a result from the last 30 minutes, else the next one up.
  const featured = (() => {
    const fresh = events.findIndex((e) => now - Date.parse(e.at) >= 0 && now - Date.parse(e.at) <= 30 * 60_000);
    if (fresh >= 0) return fresh;
    const next = events.findIndex((e) => Date.parse(e.at) > now);
    return next >= 0 ? next : 0;
  })();

  useEffect(() => {
    if (paused || events.length < 2) return;
    const t = setInterval(() => setIndex((i) => i + 1), 6000);
    return () => clearInterval(t);
  }, [paused, events.length]);

  if (events.length === 0) return null;
  const i = (featured + index) % events.length;
  const event = events[i];
  const ms = Date.parse(event.at) - now;
  const released = ms <= 0;
  const justOut = released && -ms <= 5 * 60_000;
  const imminent = !released && ms <= 30 * 60_000;
  const soon = !released && ms <= 6 * 3_600_000;
  const Icon = event.kind === "fomc" ? Landmark : CalendarClock;
  const a = num(event.actual);
  const f = num(event.forecast);
  const vs = a != null && f != null ? Math.sign(a - f) : null;
  const tone = released
    ? "border-success/40 bg-success/10 text-foreground"
    : imminent
      ? "border-warning bg-warning text-white pulse-ring"
      : soon
        ? "border-warning/50 bg-warning/15 text-foreground"
        : "border-accent/40 bg-accent/10 text-foreground";

  return (
    <Link
      href="/traders-corner/economy"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className={`hidden md:flex min-w-0 items-center gap-2 overflow-hidden rounded-full border px-2.5 py-1 font-medium transition-colors ${tone}`}
      title={`${event.label} · ${event.date} ${event.time} ET${event.previous ? ` · prev ${event.previous}` : ""}`}
    >
      <span key={`${i}:${released}`} className="slide-in flex min-w-0 items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {justOut && <span className="rounded bg-success px-1 text-[9px] font-bold uppercase tracking-wider text-white">Just out</span>}
        <span className="truncate max-w-[14rem]">{event.label}</span>
        <span className="num whitespace-nowrap">
          {released ? (
            event.actual ? (
              <>
                <span className="opacity-70">Actual</span> <span className="font-semibold">{event.actual}</span>
                {vs != null && vs !== 0 && <span className={vs > 0 ? "text-success" : "text-danger"}> {vs > 0 ? "▲" : "▼"}</span>}
                {event.forecast && <span className="opacity-70"> · exp {event.forecast}</span>}
              </>
            ) : (
              <span className="opacity-75">· released{event.forecast ? ` · exp ${event.forecast}` : ""}</span>
            )
          ) : (
            <span className={imminent ? "" : "opacity-80"}>
              · {countdownLabel(ms)}
              {event.forecast ? ` · exp ${event.forecast}` : ""}
            </span>
          )}
        </span>
      </span>
      {events.length > 1 && (
        <span className="flex shrink-0 gap-0.5" aria-hidden>
          {events.map((_, n) => (
            <span key={n} className={`h-1 w-1 rounded-full ${n === i ? "bg-current" : "bg-current opacity-30"}`} />
          ))}
        </span>
      )}
    </Link>
  );
}
