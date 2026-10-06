"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, RefreshCcw, TrendingDown, TrendingUp } from "lucide-react";
import { InfoTip } from "@/components/ui/InfoTip";
import { SCORE_NAME } from "@/lib/research/score";
import type { ScoreView } from "@/lib/research/scoreService";

const CONFIDENCE = {
  HIGH: { label: "High confidence", cls: "text-success" },
  MEDIUM: { label: "Medium confidence", cls: "text-warning" },
  LOW: { label: "Low confidence", cls: "text-muted" },
} as const;

export const scoreColor = (score: number | null | undefined) =>
  score == null ? "var(--muted)" : score >= 70 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--danger)";

export function ScoreRing({ score, size = 64 }: { score: number | null; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${SCORE_NAME} ${score ?? "n/a"}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={scoreColor(score)}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${((score ?? 0) / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 700ms ease" }}
      />
      <text x={size / 2} y={size / 2 + 6} textAnchor="middle" fontSize={size / 3.6} fontWeight="700" fill="var(--fg)" className="num">
        {score ?? "–"}
      </text>
    </svg>
  );
}

const HOW =
  "One 0–100 score built from five pillars: Quality (10-year returns on capital and margins), Growth, Strength (balance sheet), Valuation (your thresholds plus your DCF, or price-to-book vs ROE for insurers and banks) and Moat & risk (from the Company Report). The selected lens sets how much each pillar counts. Failing a must-have rule, repeated negative cash flow or a loss year caps the score.";

/** The WealthOS Score for one stock under the selected lens, with its pillar breakdown. */
export function ScoreCard({ accountId, symbol, lens, refreshKey = 0 }: { accountId: string; symbol: string; lens: string | null; refreshKey?: number }) {
  const [data, setData] = useState<ScoreView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(true);
  const [force, setForce] = useState(0);

  useEffect(() => {
    let live = true;
    const url = `/api/accounts/${accountId}/company/${encodeURIComponent(symbol)}/score?lens=${encodeURIComponent(lens ?? "none")}${force ? "&refresh=1" : ""}`;
    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.ok) {
          setData(body);
          setError(null);
        } else setError(body.error ?? "Couldn't calculate the score");
        setBusy(false);
      })
      .catch(() => live && (setError("Couldn't calculate the score"), setBusy(false)));
    return () => {
      live = false;
    };
  }, [accountId, symbol, lens, refreshKey, force]);

  if (!data) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-card p-4 flex items-center gap-3 text-sm text-muted">
        {error ? error : (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Calculating the {SCORE_NAME}…
          </>
        )}
      </div>
    );
  }

  const conf = CONFIDENCE[data.confidence];
  const missingMoat = data.pillars.some((p) => p.key === "moat" && p.score == null);

  return (
    <section className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <ScoreRing score={data.score} />
        <div className="flex-1 min-w-[200px] space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            {SCORE_NAME} <span className="font-normal text-muted">· {data.lensName} lens</span>
            <InfoTip label={SCORE_NAME}>{HOW}</InfoTip>
          </p>
          <p className={`text-xs ${conf.cls}`}>
            {conf.label}
            {missingMoat && <span className="text-muted"> · generate the {data.lensName} report to include moat &amp; risk</span>}
          </p>
          {data.strengths[0] && (
            <p className="flex items-start gap-1.5 text-xs">
              <TrendingUp className="w-3.5 h-3.5 mt-px shrink-0 text-success" /> {data.strengths.join(" · ")}
            </p>
          )}
          {data.weaknesses[0] && (
            <p className="flex items-start gap-1.5 text-xs">
              <TrendingDown className="w-3.5 h-3.5 mt-px shrink-0 text-danger" /> {data.weaknesses.join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              setForce((f) => f + 1);
            }}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover"
            title={`Recalculate (last ${new Date(data.computedAt).toLocaleString()})`}
            aria-label="Recalculate score"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover"
            aria-expanded={open}
            aria-label={open ? "Hide breakdown" : "Show breakdown"}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-5 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
          {data.pillars.map((p) => (
            <div key={p.key} className="min-w-0">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {p.label} <span className="text-muted font-normal">· counts {p.weight}%</span>
                </span>
                <span className="num font-semibold" style={{ color: scoreColor(p.score) }}>
                  {p.score ?? "—"}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p.score ?? 0}%`, background: scoreColor(p.score) }} />
              </div>
              <p className="text-[11px] text-muted mt-1 truncate" title={p.notes.join(" · ")}>
                {p.notes.join(" · ") || "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
