"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLive } from "@/components/live/LiveProvider";
import { AnimatedNumber, DeltaChip, LiveDot, fmtUsd } from "@/components/live/primitives";
import { ToolGrid } from "@/components/sections/SectionHub";
import { StepCard } from "@/components/routine/StepCard";
import { ChartStep, type Bias, type ChartStepState } from "@/components/routine/ChartStep";
import { PulseStep } from "@/components/routine/PulseStep";
import {
  BlueprintStep,
  BusinessStep,
  JournalStep,
  OpportunitiesStep,
  useRoutineSummary,
} from "@/components/routine/AccountSteps";
import {
  BLUEPRINT_CHECKLIST,
  BUSINESS_CHECKLIST,
  CHART_CHECKLIST,
  JOURNAL_CHECKLIST,
  OPPORTUNITIES_CHECKLIST,
  PULSE_CHECKLIST,
} from "@/components/routine/checklists";
import { useSelectedAccount } from "@/contexts/SelectedAccountContext";
import { TRADERS_CORNER } from "@/lib/sections";
import { useHydrated } from "@/lib/useHydrated";
import type { RoutineSymbol } from "@/lib/marketRoutineSymbols";
import { BLUEPRINT_INTERVAL_DAYS, ROUTINE_STEPS, localDateStr, type RoutineStepKey } from "@/lib/routineSteps";

interface Account {
  id: string;
  name: string;
  mode: string;
}

interface RoutineResponse {
  routine: {
    stepsCompleted: RoutineStepKey[];
    shortTermTrend: Bias | null;
    intermediateTrend: Bias | null;
    longTermTrend: Bias | null;
    volatilityCondition: string | null;
    breadthCondition: string | null;
    symbolBiases: { symbol: string; bias: Bias | null }[];
  } | null;
  lastBlueprintReview: string | null;
}

const EMPTY_CHART: ChartStepState = {
  biases: {},
  shortTermTrend: null,
  intermediateTrend: null,
  longTermTrend: null,
  volatilityCondition: null,
  breadthCondition: null,
};

const ECONOMY_HREF = "/traders-corner/economy";

export default function TradersCornerHubPage() {
  const { data } = useLive();
  const hydrated = useHydrated();
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [date] = useState(localDateStr);
  const [steps, setSteps] = useState<Set<RoutineStepKey>>(new Set());
  const [chart, setChart] = useState<ChartStepState>(EMPTY_CHART);
  const [lastBlueprint, setLastBlueprint] = useState<string | null>(null);
  const summary = useRoutineSummary(selectedAccountId);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((json) => setAccounts(Array.isArray(json) ? json : []))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    fetch(`/api/routine?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: RoutineResponse | null) => {
        if (!json) return;
        setLastBlueprint(json.lastBlueprintReview);
        const r = json.routine;
        if (!r) return;
        setSteps(new Set(r.stepsCompleted));
        setChart({
          biases: Object.fromEntries(r.symbolBiases.map((s) => [s.symbol, s.bias])),
          shortTermTrend: r.shortTermTrend,
          intermediateTrend: r.intermediateTrend,
          longTermTrend: r.longTermTrend,
          volatilityCondition: r.volatilityCondition,
          breadthCondition: r.breadthCondition,
        });
      })
      .catch(() => {});
  }, [date]);

  const save = useCallback(
    (patch: Record<string, unknown>) =>
      fetch("/api/routine", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ...patch }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((json: RoutineResponse | null) => json && setLastBlueprint(json.lastBlueprintReview))
        .catch(() => {}),
    [date]
  );

  const toggleStep = (key: RoutineStepKey) => {
    const next = new Set(steps);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSteps(next);
    save({ stepsCompleted: [...next] });
  };

  const setBias = (symbol: RoutineSymbol, bias: Bias | null, volume: number | null) => {
    setChart((c) => ({ ...c, biases: { ...c.biases, [symbol.symbol]: bias } }));
    save({
      symbolBiases: [
        { symbol: symbol.symbol, category: symbol.category, bias, dailyVolume: bias ? volume : null },
      ],
    });
  };

  const setField = (field: keyof Omit<ChartStepState, "biases">, value: string | null) => {
    setChart((c) => ({ ...c, [field]: value }));
    save({ [field]: value });
  };

  const blueprintDue =
    !steps.has("blueprint") &&
    (lastBlueprint == null ||
      (new Date(date).getTime() - new Date(lastBlueprint).getTime()) / 86_400_000 >= BLUEPRINT_INTERVAL_DAYS);
  const required = ROUTINE_STEPS.filter((s) => s.key !== "blueprint" || blueprintDue || steps.has("blueprint"));
  const doneCount = required.filter((s) => steps.has(s.key)).length;

  const account = data?.account && data.account.id === selectedAccountId ? data.account : null;
  const isOpen = data?.market.phase === "OPEN";
  const stepMeta = (key: RoutineStepKey) => {
    const i = ROUTINE_STEPS.findIndex((s) => s.key === key);
    return { index: i + 1, title: ROUTINE_STEPS[i].title, quote: ROUTINE_STEPS[i].quote, done: steps.has(key), onToggleDone: () => toggleStep(key) };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rise-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted font-semibold flex items-center gap-2">
            <LiveDot tone={isOpen ? "success" : "muted"} pulse={isOpen} />
            {TRADERS_CORNER.label} · {data?.market.label ?? "Connecting to market data"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Today&apos;s Routine</h1>
          <p className="text-muted text-sm mt-1">
            {hydrated && `${new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · `}Top-down: read the market, tend your book, then hunt.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {account && (
            <Link
              href={`/accounts/${account.id}`}
              className="rounded-xl border border-border bg-card px-4 py-2.5 shadow-card hover:bg-card-hover transition-colors"
            >
              <div className="text-[11px] text-muted">{account.name}</div>
              <div className="flex items-center gap-2">
                <AnimatedNumber value={account.netLiq} format={(n) => fmtUsd(n, 0)} className="font-semibold" />
                <DeltaChip pct={account.dayChangePct} size="xs" />
              </div>
            </Link>
          )}
          <Progress done={doneCount} total={required.length} />
        </div>
      </div>

      {/* Steps */}
      <StepCard {...stepMeta("chart")} checklist={CHART_CHECKLIST}>
        <ChartStep state={chart} onBias={setBias} onField={setField} />
      </StepCard>

      <StepCard {...stepMeta("pulse")} checklist={PULSE_CHECKLIST}>
        <PulseStep economyHref={ECONOMY_HREF} />
      </StepCard>

      {!selectedAccountId ? (
        <AccountChooser accounts={accounts} onPick={setSelectedAccountId} />
      ) : (
        <>
          <StepCard {...stepMeta("business")} checklist={BUSINESS_CHECKLIST}>
            <BusinessStep account={account} accountId={selectedAccountId} />
          </StepCard>
          <StepCard {...stepMeta("opportunities")} checklist={OPPORTUNITIES_CHECKLIST}>
            <OpportunitiesStep summary={summary} accountId={selectedAccountId} />
          </StepCard>
          <StepCard {...stepMeta("journal")} checklist={JOURNAL_CHECKLIST}>
            <JournalStep summary={summary} accountId={selectedAccountId} />
          </StepCard>
          <StepCard
            {...stepMeta("blueprint")}
            checklist={BLUEPRINT_CHECKLIST}
            defaultOpen={blueprintDue}
            badge={
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 ${
                  blueprintDue ? "bg-warning/15 text-warning" : "bg-border/60 text-muted"
                }`}
              >
                {blueprintDue ? "Due" : "Weekly"}
              </span>
            }
          >
            <BlueprintStep account={account} accountId={selectedAccountId} />
          </StepCard>
        </>
      )}

      <section className="pt-4 space-y-3">
        <h2 className="text-lg font-semibold">All tools</h2>
        <ToolGrid section={TRADERS_CORNER} />
      </section>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const complete = done === total;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-2.5 shadow-card">
      <div className="text-[11px] text-muted">{complete ? "Routine complete" : "Progress"}</div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < done ? "bg-success" : "bg-border"}`} />
          ))}
        </span>
        <span className="num text-sm font-semibold">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

function AccountChooser({ accounts, onPick }: { accounts: Account[] | null; onPick: (id: string) => void }) {
  if (accounts === null) return <div className="h-28 rounded-2xl bg-card border border-border animate-pulse" />;
  if (accounts.length === 0) {
    return (
      <div className="rise-in rounded-2xl border border-dashed border-border bg-card/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Add an account for steps 3–6</p>
          <p className="text-sm text-muted mt-1">Position triage, opportunities, journal and blueprint need an investment account.</p>
        </div>
        <Link href="/accounts">
          <Button>
            <PlusCircle className="w-4 h-4" />
            New account
          </Button>
        </Link>
      </div>
    );
  }
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card/60 p-5 space-y-3">
      <p className="text-sm">
        <span className="font-semibold">Choose an account</span>{" "}
        <span className="text-muted">to continue with position triage, opportunities, journal and blueprint.</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onPick(a.id)}
            className="text-left rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:bg-card-hover hover:-translate-y-px hover:border-accent/40"
          >
            <p className="font-semibold text-sm">{a.name}</p>
            <p className="text-xs text-muted mt-1">{a.mode === "SIMULATED" ? "Simulated" : "Live"}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
