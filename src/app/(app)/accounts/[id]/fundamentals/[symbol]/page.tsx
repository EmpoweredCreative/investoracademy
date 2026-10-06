"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { RatioStatusDot } from "@/components/fundamentals/RatioStatusDot";
import { DcfWorkbench } from "@/components/fundamentals/DcfWorkbench";
import { CompanyReport } from "@/components/research/CompanyReport";
import { FilingsPanel } from "@/components/research/FilingsPanel";
import { LongTermFinancials } from "@/components/research/LongTermFinancials";
import { NotesPanel, type ResearchRecord } from "@/components/research/NotesPanel";
import { AnalystDrawer } from "@/components/research/AnalystDrawer";
import { LensPills } from "@/components/research/LensPills";
import { ScoreCard } from "@/components/research/ScoreCard";
import type { CriteriaStatus as RatioStatus } from "@/lib/fundamentals/criteria";
import {
  ArrowLeft,
  BarChart3,
  Calculator,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  NotebookPen,
  RefreshCcw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

interface ScoredRatio {
  key: string;
  name: string;
  value: number | null;
  formattedValue: string;
  required?: boolean;
  score: { status: RatioStatus; label: string; warning?: string };
}

interface SymbolData {
  symbol: string;
  watchlistItem: { yahooFetchStatus: string; yahooFetchError: string | null } | null;
  snapshot: { fetchedAt: string; nextEarningsDate: string | null; price: number | null } | null;
  ratios: ScoredRatio[];
  evaluation?: { score: number | null; passScore: number; verdict: string; failedRequired: string[] };
  research?: (Partial<ResearchRecord> & { updatedAt?: string }) | null;
}

const TABS = [
  { key: "report", label: "Report", icon: Sparkles },
  { key: "filings", label: "Filings", icon: FileText },
  { key: "financials", label: "Financials", icon: BarChart3 },
  { key: "valuation", label: "Valuation", icon: Calculator },
  { key: "notes", label: "Notes", icon: NotebookPen },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const VERDICT_STYLE: Record<string, string> = {
  PASS: "bg-success/12 text-success",
  WATCH: "bg-warning/15 text-warning",
  FAIL: "bg-danger/12 text-danger",
  REJECT: "bg-danger/12 text-danger",
  INSUFFICIENT_DATA: "bg-border text-muted",
};

function CompanyPage() {
  const params = useParams();
  const accountId = params.id as string;
  const symbol = decodeURIComponent(params.symbol as string).toUpperCase();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "report";
  const setTab = (key: TabKey) => router.replace(key === "report" ? pathname : `${pathname}?tab=${key}`, { scroll: false });

  const [data, setData] = useState<SymbolData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  // One lens for the whole page: it drives both the score and the report.
  const initialLens = searchParams.get("lens");
  const [lens, setLens] = useState<string | null>(initialLens === "none" ? null : (initialLens ?? "buffett"));
  const [scoreVersion, setScoreVersion] = useState(0);
  const bumpScore = useCallback(() => setScoreVersion((v) => v + 1), []);

  const apply = useCallback(async (res: Response) => {
    if (res.ok) {
      setData(await res.json());
      setNotFound(false);
    } else if (res.status === 404) setNotFound(true);
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    await apply(await fetch(`/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}`));
  }, [accountId, symbol, apply]);

  useEffect(() => {
    let live = true;
    fetch(`/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}`).then((res) => {
      if (live) apply(res);
    });
    return () => {
      live = false;
    };
  }, [accountId, symbol, apply]);

  const status = data?.watchlistItem?.yahooFetchStatus;
  useEffect(() => {
    if (status !== "PENDING" && status !== "FETCHING") return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [status, load]);

  const refreshYahoo = async () => {
    setRefreshing(true);
    await fetch(`/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}/refresh`, { method: "POST" });
    await load();
    setRefreshing(false);
  };

  const addToWatchlist = async () => {
    setAdding(true);
    await fetch(`/api/accounts/${accountId}/fundamentals/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    await load();
    setAdding(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="text-center py-16 space-y-3">
        <h1 className="text-2xl font-bold">{symbol}</h1>
        <p className="text-muted text-sm">{symbol} isn&apos;t on your watchlist yet.</p>
        <Button onClick={addToWatchlist} disabled={adding}>
          {adding && <Loader2 className="w-4 h-4 animate-spin" />} Add {symbol} and start researching
        </Button>
        <div>
          <Link href={`/accounts/${accountId}/fundamentals?tab=watchlist`} className="text-accent text-sm">
            Back to watchlist
          </Link>
        </div>
      </div>
    );
  }

  const yahooReady = status === "READY" && data.snapshot != null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/accounts/${accountId}/fundamentals?tab=watchlist`}>
            <Button variant="ghost" size="sm" aria-label="Back to watchlist">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{symbol}</h1>
              {data.research?.verdict && (
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[data.research.verdict] ?? ""}`}>
                  Your verdict: {data.research.verdict}
                </span>
              )}
            </div>
            <p className="text-muted text-sm num">
              {data.snapshot?.price != null ? `$${data.snapshot.price.toFixed(2)}` : "—"}
              {data.snapshot?.nextEarningsDate && <span> · next earnings {data.snapshot.nextEarningsDate}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refreshYahoo} disabled={refreshing} title="Refresh live fundamentals from Yahoo">
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </Button>
          <a href={`https://finviz.com/quote.ashx?t=${symbol}`} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">
              Finviz <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
          <a href={`https://finance.yahoo.com/quote/${symbol}`} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">
              Yahoo <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
          <AnalystDrawer
            accountId={accountId}
            symbol={symbol}
            disabled={!yahooReady}
            onResearchChange={load}
            disabledReason={status === "ERROR" ? "Live data fetch failed. Try refreshing." : "Waiting for live fundamentals…"}
          />
        </div>
      </div>

      <LensPills
        value={lens}
        onChange={setLens}
        noneLabel="General"
        onOwnStrategy={() => router.push(`/accounts/${accountId}/fundamentals?tab=screener`)}
      />
      <ScoreCard accountId={accountId} symbol={symbol} lens={lens} refreshKey={scoreVersion} />

      <nav className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-card w-fit max-w-full overflow-x-auto no-scrollbar" aria-label={`${symbol} sections`}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {data.watchlistItem?.yahooFetchError && (
        <p className="text-xs text-danger">Live data: {data.watchlistItem.yahooFetchError}</p>
      )}

      {tab === "report" && (
        <CompanyReport key={lens ?? "none"} accountId={accountId} symbol={symbol} lens={lens} onReportReady={bumpScore} />
      )}
      {tab === "filings" && <FilingsPanel accountId={accountId} symbol={symbol} />}
      {tab === "financials" && <LongTermFinancials accountId={accountId} symbol={symbol} />}
      {tab === "valuation" && (
        <div className="space-y-4">
          {yahooReady ? <Scorecard data={data} /> : <p className="text-sm text-muted">Waiting for live fundamentals…</p>}
          <DcfWorkbench
            accountId={accountId}
            symbol={symbol}
            onSaved={() => {
              load();
              bumpScore();
            }}
          />
        </div>
      )}
      {tab === "notes" && (
        <NotesPanel key={data.research?.updatedAt ?? "new"} accountId={accountId} symbol={symbol} research={data.research ?? null} onSaved={load} />
      )}

    </div>
  );
}

function Scorecard({ data }: { data: SymbolData }) {
  return (
    <div className="space-y-3">
      {data.evaluation && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-card">
          <ScoreRing score={data.evaluation.score} pass={data.evaluation.passScore} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLE[data.evaluation.verdict] ?? VERDICT_STYLE.INSUFFICIENT_DATA}`}>
                {data.evaluation.verdict.replace("_", " ")}
              </span>
              <span className="text-xs text-muted">pass at {data.evaluation.passScore}+ on your criteria</span>
            </div>
            {data.evaluation.failedRequired.length > 0 && (
              <p className="text-xs text-danger mt-1">Required rule not met: {data.evaluation.failedRequired.join(", ")}</p>
            )}
          </div>
          <Link href="/settings#research-criteria" className="flex items-center gap-1.5 text-xs text-accent hover:underline">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Edit criteria
          </Link>
        </div>
      )}
      <div className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Live metrics vs your criteria</h2>
          {data.snapshot?.fetchedAt && <span className="text-[11px] text-muted">Updated {new Date(data.snapshot.fetchedAt).toLocaleString()}</span>}
        </div>
        <table className="w-full text-sm">
          <tbody>
            {data.ratios.map((r) => (
              <tr key={r.key} className="border-b border-border/40 hover:bg-card-hover/50">
                <td className="px-4 py-2.5 w-8">
                  <RatioStatusDot status={r.score.status} />
                </td>
                <td className="px-4 py-2.5 font-medium">
                  {r.name}
                  {r.required && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-accent">required</span>}
                </td>
                <td className="px-4 py-2.5 num">{r.formattedValue}</td>
                <td className="px-4 py-2.5">
                  <span className="text-muted num text-xs">{r.score.label}</span>
                  {r.score.warning && (
                    <span className="block text-xs text-warning mt-0.5">
                      <Info className="w-3 h-3 inline mr-0.5" />
                      {r.score.warning}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreRing({ score, pass }: { score: number | null; pass: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;
  const color = score == null ? "var(--muted)" : score >= pass ? "var(--success)" : score >= pass - 20 ? "var(--warning)" : "var(--danger)";
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" aria-label={`Criteria score ${score ?? "n/a"}`}>
      <circle cx="30" cy="30" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 30 30)"
        style={{ transition: "stroke-dasharray 700ms ease" }}
      />
      <text x="30" y="35" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--fg)" className="num">
        {score ?? "–"}
      </text>
    </svg>
  );
}

export default function CompanyResearchPage() {
  return (
    <Suspense>
      <CompanyPage />
    </Suspense>
  );
}
