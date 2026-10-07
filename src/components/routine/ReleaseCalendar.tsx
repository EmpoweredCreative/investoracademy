"use client";

import { Landmark } from "lucide-react";
import type { CalendarEvent } from "@/lib/marketdata/fred";
import { localDateStr } from "@/lib/routineSteps";

/** Parse "0.3%", "200K", "7.08M", "55.1" for comparing actual vs forecast. */
function numeric(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return /K$/i.test(v) ? n * 1e3 : /M$/i.test(v) ? n * 1e6 : /B$/i.test(v) ? n * 1e9 : n;
}

const parse = (d: string) => new Date(d + "T12:00:00");

function dayHeading(date: string): string {
  const diff = Math.round((parse(date).getTime() - parse(localDateStr()).getTime()) / 86_400_000);
  const label = parse(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return diff === 0 ? `Today · ${label}` : diff === 1 ? `Tomorrow · ${label}` : label;
}

/** Economic releases grouped by day, with previous / expected / actual columns. */
export function ReleaseCalendar({ events, emptyText = "No major releases scheduled." }: { events: CalendarEvent[]; emptyText?: string }) {
  if (events.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;

  const today = localDateStr();
  const days = [...new Set(events.map((e) => e.date))];

  return (
    <div className="rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-sm min-w-[440px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted border-b border-border">
            <th className="text-left font-semibold py-2 pl-3 pr-2 w-[72px]">ET</th>
            <th className="text-left font-semibold py-2 px-2">Release</th>
            <th className="text-right font-semibold py-2 px-2 w-[64px]">Prev</th>
            <th className="text-right font-semibold py-2 px-2 w-[64px]">Exp</th>
            <th className="text-right font-semibold py-2 pl-2 pr-3 w-[80px]">Actual</th>
          </tr>
        </thead>
        {days.map((day) => (
          <tbody key={day} className={day < today ? "opacity-80" : undefined}>
            <tr className="bg-background/60">
              <td colSpan={5} className="py-1.5 px-3 text-[11px] font-semibold text-muted">
                {dayHeading(day)}
              </td>
            </tr>
            {events
              .filter((e) => e.date === day)
              .map((e) => (
                <EventRow key={`${e.date}-${e.time}-${e.label}`} e={e} />
              ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function EventRow({ e }: { e: CalendarEvent }) {
  const actual = numeric(e.actual);
  const forecast = numeric(e.forecast);
  const vs = actual != null && forecast != null ? Math.sign(actual - forecast) : null;
  return (
    <tr className="border-t border-border/50">
      <td className="py-1.5 pl-3 pr-2 text-xs text-muted num whitespace-nowrap">{e.time}</td>
      <td className="py-1.5 px-2">
        <span className={`inline-flex items-center gap-1.5 ${e.high ? "font-semibold" : ""}`}>
          {e.kind === "fomc" && <Landmark className="w-3.5 h-3.5 text-accent shrink-0" />}
          {e.label}
          {e.high && e.kind !== "fomc" && <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" title="High impact" />}
        </span>
      </td>
      <td className="py-1.5 px-2 text-right num text-muted">{e.previous ?? "—"}</td>
      <td className="py-1.5 px-2 text-right num">{e.forecast ?? <span className="text-muted">—</span>}</td>
      <td className="py-1.5 pl-2 pr-3 text-right num whitespace-nowrap">
        {e.actual ? (
          <span className="font-semibold" title={vs ? (vs > 0 ? "Above expected" : "Below expected") : undefined}>
            {e.actual}
            {vs != null && vs !== 0 && <span className="ml-1 text-[10px] text-muted">{vs > 0 ? "▲" : "▼"}</span>}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

/** Where the numbers come from. */
export function CalendarSourceNote() {
  return (
    <p className="text-[11px] text-muted">
      Exp = consensus forecast from Forex Factory, published for the current week. Actuals are filled in from FRED shortly
      after release; surveys like ISM and consumer sentiment aren&apos;t in free data. ● = high impact · ▲▼ = actual vs
      expected.
    </p>
  );
}
