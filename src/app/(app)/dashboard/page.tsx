"use client";

import { useEffect, useState } from "react";
import { ActivityLog } from "@/components/desk/Desk";
import { useLive } from "@/components/live/LiveProvider";
import { LiveDot } from "@/components/live/primitives";
import {
  FoundationSnapshot,
  InvestingYearPanel,
  NetWorthHero,
  QuickActions,
  TradersSnapshot,
  type DashboardData,
} from "@/components/dashboard/DashboardParts";
import { localDateStr } from "@/lib/routineSteps";
import { useHydrated } from "@/lib/useHydrated";
import { Scoreboard, ScoreboardSkeleton } from "@/components/dashboard/Scoreboard";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { data: live } = useLive();
  const hydrated = useHydrated();
  const [d, setD] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/dashboard?date=${localDateStr()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="space-y-4">
      <div className="rise-in">
        <p className="text-xs uppercase tracking-[0.16em] text-muted font-semibold flex items-center gap-2">
          <LiveDot tone={live?.market.phase === "OPEN" ? "success" : "muted"} pulse={live?.market.phase === "OPEN"} />
          {live?.market.label ?? "Connecting to market data"}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">{hydrated ? `${greeting()}.` : "\u00a0"}</h1>
        <p className="text-muted text-sm mt-1">
          {hydrated ? `${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · ` : ""}here&apos;s where you stand.
        </p>
      </div>

      {error && <p className="text-sm text-danger">Couldn&apos;t load your dashboard. Refresh to try again.</p>}
      {!d ? (
        !error && (
          <div className="space-y-4">
            <ScoreboardSkeleton />
            <div className="h-28 rounded-2xl bg-card border border-border animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-48 rounded-2xl bg-card border border-border animate-pulse" />
              <div className="h-48 rounded-2xl bg-card border border-border animate-pulse" />
            </div>
          </div>
        )
      ) : (
        <>
          <Scoreboard data={d.scoreboard} />
          <QuickActions />
          <NetWorthHero d={d} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FoundationSnapshot d={d} />
            <TradersSnapshot d={d} />
          </div>
          <InvestingYearPanel y={d.investing.year} />
          <ActivityLog items={live?.activity ?? []} title="Recent activity · all accounts" limit={8} />
        </>
      )}
    </div>
  );
}
