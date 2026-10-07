"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, ExternalLink, Landmark } from "lucide-react";
import type { CalendarEvent, Reading } from "@/lib/marketdata/fred";
import { StepLabel } from "./StepCard";
import { FAVORITE_SITES } from "./checklists";
import { localDateStr } from "@/lib/routineSteps";

export interface MacroPayload {
  configured: boolean;
  readings: Record<string, Reading>;
  liveYields: Record<string, { value: number; change: number | null } | null>;
  calendar: CalendarEvent[];
}

const HEADLINE = ["cpi", "coreCpi", "ppi", "corePce", "unemployment"] as const;
const YIELD_KEYS = [
  { key: "y3m", label: "3M" },
  { key: "y2", label: "2Y" },
  { key: "y5", label: "5Y" },
  { key: "y10", label: "10Y" },
  { key: "y30", label: "30Y" },
] as const;

export function useMacro(days = 7) {
  const [data, setData] = useState<MacroPayload | null>(null);
  useEffect(() => {
    const load = () =>
      fetch(`/api/market/macro?days=${days}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => json && setData(json))
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [days]);
  return data;
}

/** Current yield per tenor: live Yahoo where available, FRED's daily close otherwise. */
export function currentYields(data: MacroPayload) {
  return YIELD_KEYS.map(({ key, label }) => {
    const live = data.liveYields[key];
    const fred = data.readings[key];
    return {
      key,
      label,
      value: live?.value ?? fred?.value ?? null,
      change: live ? live.change : fred && fred.previous != null ? fred.value - fred.previous : null,
      live: Boolean(live),
    };
  });
}

export function PulseStep({ economyHref }: { economyHref: string }) {
  const data = useMacro(7);

  if (!data) return <div className="h-40 rounded-xl bg-border/30 animate-pulse" />;

  const r = data.readings;
  const yields = currentYields(data);
  const y2 = yields.find((y) => y.key === "y2")?.value;
  const y10 = yields.find((y) => y.key === "y10")?.value;
  // Prefer FRED's spread so both legs come from the same daily close.
  const spread = r.t10y2y?.value ?? (y2 != null && y10 != null ? y10 - y2 : null);
  const fed = r.fedFunds && r.fedFundsLower ? `${r.fedFundsLower.value.toFixed(2)}–${r.fedFunds.value.toFixed(2)}%` : null;

  return (
    <div className="space-y-5">
      {!data.configured && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          Add a free <code className="text-xs">FRED_API_KEY</code> to show CPI, PPI, jobs and Fed data. Get one at{" "}
          <a className="underline" href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer">
            fred.stlouisfed.org
          </a>
          .
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
        <div className="space-y-5">
          {data.configured && (
            <div>
              <StepLabel>Economy</StepLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MacroTile label="Fed Funds" value={fed} sub={r.fedFunds ? `Target range · ${shortDate(r.fedFunds.date)}` : undefined} icon />
                {HEADLINE.map((k) => {
                  const x = r[k];
                  return (
                    <MacroTile
                      key={k}
                      label={x?.label ?? k}
                      value={x ? `${x.value.toFixed(1)}%` : null}
                      delta={x && x.previous != null ? x.value - x.previous : null}
                      sub={x ? `${k === "unemployment" ? "Rate" : "y/y"} · ${monthLabel(x.date)}` : undefined}
                      invert
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <StepLabel>Treasury yields</StepLabel>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-xl overflow-hidden border border-border bg-border">
              {yields.map((y) => (
                <div key={y.key} className="bg-card px-3 py-2.5" title={y.live ? "Live" : "FRED daily close"}>
                  <div className="text-[11px] font-semibold text-muted">{y.label}</div>
                  <div className="num text-sm font-semibold mt-0.5">{y.value != null ? `${y.value.toFixed(2)}%` : "—"}</div>
                  <Bps change={y.change} />
                </div>
              ))}
              <div className="bg-card px-3 py-2.5" title="10-year minus 2-year">
                <div className="text-[11px] font-semibold text-muted">2s10s</div>
                <div className={`num text-sm font-semibold mt-0.5 ${spread != null && spread < 0 ? "text-danger" : ""}`}>
                  {spread != null ? `${spread >= 0 ? "+" : ""}${(spread * 100).toFixed(0)} bp` : "—"}
                </div>
                <div className="text-[10px] text-muted">{spread != null && spread < 0 ? "Inverted" : "Normal"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <StepLabel>Up next · 7 days</StepLabel>
            {data.calendar.length === 0 ? (
              <p className="text-sm text-muted">No major releases scheduled this week.</p>
            ) : (
              <ul className="rounded-xl border border-border divide-y divide-border">
                {data.calendar.slice(0, 6).map((e) => (
                  <li key={`${e.date}-${e.label}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    {e.kind === "fomc" ? (
                      <Landmark className="w-4 h-4 text-accent shrink-0" />
                    ) : (
                      <CalendarClock className="w-4 h-4 text-muted shrink-0" />
                    )}
                    <span className={`flex-1 ${e.kind === "fomc" ? "font-semibold" : ""}`}>{e.label}</span>
                    <span className="text-xs text-muted num whitespace-nowrap">
                      {dayLabel(e.date)} · {e.time} ET
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <StepLabel>Your sites</StepLabel>
            <div className="flex flex-wrap gap-2">
              {FAVORITE_SITES.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-card-hover"
                >
                  {s.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Link href={economyHref} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
        Open the Economy dashboard
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function MacroTile({
  label,
  value,
  sub,
  delta,
  invert,
  icon,
}: {
  label: string;
  value: string | null;
  sub?: string;
  delta?: number | null;
  /** Rising is bad (inflation, unemployment). */
  invert?: boolean;
  icon?: boolean;
}) {
  const good = delta != null && delta !== 0 ? (invert ? delta < 0 : delta > 0) : null;
  return (
    <div className="rounded-xl border border-border bg-background/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        {icon && <Landmark className="w-3 h-3" />}
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="num text-lg font-semibold">{value ?? "—"}</span>
        {delta != null && delta !== 0 && (
          <span className={`num text-[11px] ${good ? "text-success" : "text-danger"}`}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
          </span>
        )}
      </div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

function Bps({ change }: { change: number | null }) {
  if (change == null) return <div className="text-[10px] text-muted">—</div>;
  const bp = Math.round(change * 100);
  return (
    <div className={`num text-[10px] ${bp > 0 ? "text-danger" : bp < 0 ? "text-success" : "text-muted"}`}>
      {bp > 0 ? "+" : ""}
      {bp} bp
    </div>
  );
}

const parse = (d: string) => new Date(d + "T12:00:00");
export const monthLabel = (d: string) => parse(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
export const shortDate = (d: string) => parse(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export function dayLabel(d: string) {
  const diff = Math.round((parse(d).getTime() - parse(localDateStr()).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return parse(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
