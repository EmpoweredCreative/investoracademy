"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Panel } from "@/components/live/primitives";
import { CurveLegend, LineChart, YieldCurveChart, type Curve } from "@/components/charts/EconCharts";
import { currentYields, monthLabel, shortDate, useMacro } from "@/components/routine/PulseStep";
import { CalendarSourceNote, ReleaseCalendar } from "@/components/routine/ReleaseCalendar";
import type { Point } from "@/lib/marketdata/fred";

interface Series {
  key: string;
  label: string;
  description: string;
  transform: "level" | "yoy";
  points: Point[];
}

interface History {
  configured: boolean;
  series: Series[];
  curve: Curve[];
}

/** Charts shown as small multiples, in reading order. */
const CHARTS: { key: string; zero?: boolean }[] = [
  { key: "cpi" },
  { key: "coreCpi" },
  { key: "ppi" },
  { key: "corePce" },
  { key: "unemployment" },
  { key: "fedFunds" },
  { key: "y2" },
  { key: "y10" },
  { key: "t10y2y", zero: true },
];

const CURVE_NAMES = ["Today", "1 month ago", "1 year ago"];
const pct = (v: number) => `${v.toFixed(1)}%`;

export default function EconomyPage() {
  const macro = useMacro(30);
  const [history, setHistory] = useState<History | null>(null);

  useEffect(() => {
    fetch("/api/market/macro/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json && setHistory(json))
      .catch(() => {});
  }, []);

  const byKey = new Map(history?.series.map((s) => [s.key, s]) ?? []);
  const r = macro?.readings ?? {};
  const notConfigured = macro?.configured === false || history?.configured === false;

  return (
    <div className="space-y-6">
      <div className="rise-in">
        <Link href="/traders-corner" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Trader&apos;s Corner
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">Economy</h1>
        <p className="text-muted text-sm mt-1">Inflation, jobs, Fed policy and Treasury yields — data from FRED (St. Louis Fed).</p>
      </div>

      {notConfigured && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          Economic data needs a free <code className="text-xs">FRED_API_KEY</code> in your environment. Get one at{" "}
          <a className="underline" href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer">
            fred.stlouisfed.org
          </a>
          . Live yields and FOMC dates still show below.
        </div>
      )}

      {/* Latest readings */}
      {macro?.configured && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
          <Reading
            label="Fed Funds target"
            value={r.fedFunds && r.fedFundsLower ? `${r.fedFundsLower.value.toFixed(2)}–${r.fedFunds.value.toFixed(2)}%` : null}
            sub={r.fedFunds ? `since ${shortDate(r.fedFunds.date)}` : undefined}
          />
          <Reading label="Effective rate" value={r.effr ? `${r.effr.value.toFixed(2)}%` : null} sub={r.effr && shortDate(r.effr.date)} />
          {(["cpi", "coreCpi", "ppi", "corePce", "unemployment"] as const).map((k) => (
            <Reading
              key={k}
              label={r[k]?.label ?? k}
              value={r[k] ? pct(r[k].value) : null}
              sub={r[k] ? `${monthLabel(r[k].date)} · prior ${r[k].previous != null ? pct(r[k].previous!) : "—"}` : undefined}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
        {/* Yield curve */}
        <Panel title="Treasury yield curve" subtitle={history?.curve[0] ? `as of ${shortDate(history.curve[0].date)}` : undefined}>
          {history?.curve.length ? (
            <div className="space-y-3">
              <CurveLegend names={CURVE_NAMES} />
              <YieldCurveChart curves={history.curve} names={CURVE_NAMES} />
              <table className="w-full text-xs num">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left font-medium py-1" />
                    {history.curve[0].points.map((p) => (
                      <th key={p.tenor} className="text-right font-medium py-1">
                        {p.tenor}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.curve.map((c, i) => (
                    <tr key={c.date} className="border-t border-border/60">
                      <td className="py-1 text-muted">
                        {CURVE_NAMES[i]} <span className="opacity-70">({shortDate(c.date)})</span>
                      </td>
                      {c.points.map((p) => (
                        <td key={p.tenor} className="text-right py-1">
                          {p.value != null ? `${p.value.toFixed(2)}%` : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : macro ? (
            <div className="grid grid-cols-5 gap-2">
              {currentYields(macro).map((y) => (
                <div key={y.key} className="rounded-xl border border-border px-3 py-2">
                  <div className="text-[11px] text-muted">{y.label}</div>
                  <div className="num font-semibold">{y.value != null ? `${y.value.toFixed(2)}%` : "—"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-60 rounded-xl bg-border/30 animate-pulse" />
          )}
        </Panel>

        {/* Release calendar */}
        <Panel title="Release calendar" subtitle="This week through the next 30 days · times ET">
          {!macro ? (
            <div className="h-60 rounded-xl bg-border/30 animate-pulse" />
          ) : (
            <div className="space-y-2">
              <ReleaseCalendar events={macro.calendar} emptyText="Nothing scheduled." />
              <CalendarSourceNote />
            </div>
          )}
        </Panel>
      </div>

      {/* History small multiples */}
      {history?.configured && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em]">Two-year history</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {CHARTS.map(({ key, zero }) => {
              const s = byKey.get(key);
              if (!s) return null;
              const last = s.points.at(-1);
              const fmt = key === "t10y2y" ? (v: number) => `${v.toFixed(2)}` : (v: number) => `${v.toFixed(1)}%`;
              return (
                <Panel
                  key={key}
                  title={s.label}
                  subtitle={s.description}
                  right={last && <span className="num text-sm font-semibold">{key === "t10y2y" ? `${last.value.toFixed(2)} pts` : pct(last.value)}</span>}
                >
                  <LineChart points={s.points} format={fmt} zeroLine={zero} label={s.label} />
                </Panel>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Reading({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <p className="text-[11px] uppercase tracking-[0.1em] text-muted font-semibold">{label}</p>
      <p className="num mt-1 text-xl font-semibold">{value ?? "—"}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
