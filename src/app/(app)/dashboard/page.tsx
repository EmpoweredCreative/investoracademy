"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLive } from "@/components/live/LiveProvider";
import { LiveDot, fmtUsd } from "@/components/live/primitives";
import { ActivityLog, MarketPulse } from "@/components/desk/Desk";

interface Account {
  id: string;
  name: string;
  mode: string;
  cashBalance: string;
  onboardingCompletedAt: string | null;
  _count: {
    strategyInstances: number;
    reinvestSignals: number;
  };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const { data } = useLive();

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((json) => {
        setAccounts(Array.isArray(json) ? json : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="rise-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted font-semibold flex items-center gap-2">
            <LiveDot tone={data?.market.phase === "OPEN" ? "success" : "muted"} pulse={data?.market.phase === "OPEN"} />
            {data?.market.label ?? "Connecting to market data"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">{greeting()}.</h1>
          <p className="text-muted text-sm mt-1">Here&apos;s the market and your accounts, updating live.</p>
        </div>
        <Link href="/accounts">
          <Button>
            <PlusCircle className="w-4 h-4" />
            New Account
          </Button>
        </Link>
      </div>

      <MarketPulse />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4">
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em]">Your accounts</h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-36 rounded-2xl bg-card border border-border animate-pulse" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
              <AlertCircle className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-muted">No accounts yet. Create your first account to get started.</p>
              <Link href="/accounts" className="inline-block mt-4">
                <Button size="sm">
                  <PlusCircle className="w-4 h-4" />
                  Create Account
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {accounts.map((account, i) => {
                const live = account.mode !== "SIMULATED";
                return (
                  <Link
                    key={account.id}
                    href={`/accounts/${account.id}`}
                    className="rise-in group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card hover:-translate-y-0.5 hover:border-accent/40 transition-all"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="desk-grid absolute inset-0 opacity-50" aria-hidden />
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{account.name}</h3>
                          <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
                            <LiveDot tone={live ? "success" : "warning"} pulse={live} />
                            {live ? "Live · Schwab" : "Simulated"}
                          </p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
                      </div>
                      <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">Cash</p>
                      <p className="num text-2xl font-semibold">{fmtUsd(parseFloat(account.cashBalance ?? "0"), 0)}</p>
                      <div className="mt-3 flex gap-3 text-xs text-muted">
                        <span>
                          <span className="num text-foreground">{account._count.strategyInstances}</span> trades
                        </span>
                        <span>
                          <span className="num text-foreground">{account._count.reinvestSignals}</span> reinvest signals
                        </span>
                        {!account.onboardingCompletedAt && <span className="text-warning">setup mode</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <ActivityLog items={data?.activity ?? []} title="Activity · all accounts" />
      </div>
    </div>
  );
}
