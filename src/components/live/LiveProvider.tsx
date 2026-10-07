"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { MarketStatus } from "@/lib/marketClock";
import type { LiveQuote } from "@/lib/marketdata/liveQuotes";
import type { Bucket } from "@/lib/buckets";

export interface LiveHolding {
  underlyingId: string;
  symbol: string;
  name: string | null;
  bucket: Bucket;
  shares: number;
  price: number | null;
  change: number | null;
  changePct: number | null;
  value: number;
  costBasis: number;
  unrealized: number | null;
  openOptions: number;
}

export interface LiveAccount {
  id: string;
  name: string;
  mode: string;
  netLiq: number;
  cash: number;
  reserve: number;
  holdingsValue: number;
  costBasis: number;
  unrealized: number;
  dayChange: number;
  dayChangePct: number;
  buckets: { bucket: Bucket; value: number; actualPct: number; targetPct: number }[];
  holdings: LiveHolding[];
}

export interface ActivityItem {
  id: string;
  kind: string;
  title: string;
  account: string | null;
  amount: number | null;
  at: string;
}

export interface BrokerSync {
  broker: string;
  lastSyncedAt: string | null;
  error: string | null;
  syncing: boolean;
  netLiq: number | null;
  buyingPower: number | null;
  dayPnl: number | null;
}

interface LivePayload {
  serverTime: string;
  market: MarketStatus;
  sync: BrokerSync | null;
  feed: { source: string; latencyMs: number; delayed: boolean };
  marketSymbols: { symbol: string; label: string }[];
  /** Live Wire groups in display order (futures → market → sectors → positions). */
  wire?: { key: string; label: string; items: { symbol: string; label: string }[] }[];
  quotes: Record<string, LiveQuote>;
  series?: Record<string, number[]>;
  account: LiveAccount | null;
  activity: ActivityItem[];
}

export type FeedStatus = "connecting" | "live" | "stale" | "error";

interface LiveContextValue {
  data: LivePayload | null;
  status: FeedStatus;
  lastUpdated: number | null;
  /** Intraday series per symbol, extended with every tick we observe. */
  series: Record<string, number[]>;
  /** Activity ids that arrived since the first load (for slide-in highlighting). */
  freshActivity: Set<string>;
  refresh: () => void;
}

const LiveContext = createContext<LiveContextValue | null>(null);

const OPEN_INTERVAL = 10_000;
const CLOSED_INTERVAL = 60_000;
const SERIES_REFRESH_MS = 5 * 60_000;
const MAX_POINTS = 120;

export function LiveProvider({ accountId, children }: { accountId: string | null; children: ReactNode }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const [freshActivity, setFreshActivity] = useState<Set<string>>(new Set());

  const seenActivity = useRef<Set<string> | null>(null);
  const lastSeriesAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const wantSeries = Date.now() - lastSeriesAt.current > SERIES_REFRESH_MS;
    const qs = new URLSearchParams();
    if (accountId) qs.set("accountId", accountId);
    if (wantSeries) qs.set("series", "1");

    let nextDelay = OPEN_INTERVAL;
    try {
      const res = await fetch(`/api/live?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload: LivePayload = await res.json();

      setSeries((prev) => {
        const next: Record<string, number[]> = { ...prev };
        if (payload.series) {
          lastSeriesAt.current = Date.now();
          for (const [sym, pts] of Object.entries(payload.series)) {
            if (pts.length) next[sym] = pts.slice(-MAX_POINTS);
          }
        }
        for (const [sym, q] of Object.entries(payload.quotes)) {
          if (q.price == null) continue;
          const pts = next[sym] ?? [];
          if (pts[pts.length - 1] !== q.price) next[sym] = [...pts, q.price].slice(-MAX_POINTS);
        }
        return next;
      });

      const ids = payload.activity.map((a) => a.id);
      if (seenActivity.current === null) {
        seenActivity.current = new Set(ids);
      } else {
        const fresh = ids.filter((id) => !seenActivity.current!.has(id));
        if (fresh.length) {
          fresh.forEach((id) => seenActivity.current!.add(id));
          setFreshActivity(new Set(fresh));
        }
      }

      setData(payload);
      setStatus("live");
      setLastUpdated(Date.now());
      nextDelay = payload.market.phase === "OPEN" ? OPEN_INTERVAL : CLOSED_INTERVAL;
    } catch {
      setStatus((s) => (s === "live" ? "stale" : "error"));
      nextDelay = 20_000;
    } finally {
      inFlight.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        timer.current = setTimeout(poll, nextDelay);
      }
    }
  }, [accountId]);

  useEffect(() => {
    seenActivity.current = null;
    lastSeriesAt.current = 0;
    setStatus("connecting");
    poll();
    const onVisibility = () => {
      if (document.visibilityState === "visible") poll();
      else if (timer.current) clearTimeout(timer.current);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  return (
    <LiveContext.Provider value={{ data, status, lastUpdated, series, freshActivity, refresh: poll }}>
      {children}
    </LiveContext.Provider>
  );
}

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside LiveProvider");
  return ctx;
}

/** Re-renders every `ms` (default 1s) — for clocks and "updated Xs ago". */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
