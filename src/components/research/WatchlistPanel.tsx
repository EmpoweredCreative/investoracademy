"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Loader2, Plus, RefreshCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InfoTip } from "@/components/ui/InfoTip";
import { SCORE_NAME } from "@/lib/research/score";
import { scoreColor } from "./ScoreCard";
import { LensPills } from "./LensPills";
import { getBuiltinLens } from "@/lib/research/lenses";

type SortKey = "symbol" | "price" | "score" | "asOf";
type SortDir = "asc" | "desc";

interface WatchlistItem {
  id: string;
  symbol: string;
  source: string;
  yahooFetchStatus: string;
  yahooFetchError: string | null;
  yahooFetchedAt: string | null;
  importedAt: string;
  score: number | null;
  verdict: string;
  price: number | null;
  wealthScore: number | null;
  scoreConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  scoreQuick: boolean;
}

const VERDICT_STYLE: Record<string, { dot: string; chip: string; label: string }> = {
  PASS: { dot: "bg-success", chip: "bg-success/12 text-success", label: "Pass" },
  WATCH: { dot: "bg-warning", chip: "bg-warning/15 text-warning", label: "Watch" },
  FAIL: { dot: "bg-danger", chip: "bg-danger/12 text-danger", label: "Fail" },
  INSUFFICIENT_DATA: { dot: "bg-border", chip: "bg-border text-muted", label: "No data" },
};

const STALE_MS = 3 * 24 * 3600_000;

function SortButton({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (column: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 transition-colors ${active ? "text-foreground" : "text-muted hover:text-foreground"} ${className}`}
    >
      {label}
      <Icon className={`w-3 h-3 ${active ? "" : "opacity-40"}`} aria-hidden />
    </button>
  );
}

/**
 * The research watchlist, scored by the user's criteria or an investor lens.
 * Handles adding tickers, Finviz CSV import and refreshing Yahoo data.
 */
export function WatchlistPanel({ accountId, refreshKey = 0 }: { accountId: string; refreshKey?: number }) {
  const router = useRouter();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lens, setLens] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [manualSymbol, setManualSymbol] = useState("");
  const [adding, setAdding] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [scoring, setScoring] = useState(false);
  const [scoreMsg, setScoreMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchList = useCallback(async () => {
    const res = await fetch(`/api/accounts/${accountId}/fundamentals/watchlist${lens ? `?lens=${lens}` : ""}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, [accountId, lens]);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshKey]);

  const hasPending = items.some((i) => i.yahooFetchStatus === "PENDING" || i.yahooFetchStatus === "FETCHING");
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(fetchList, 3000);
    return () => clearInterval(id);
  }, [hasPending, fetchList]);

  const toggleSort = (column: SortKey) => {
    if (sortKey === column) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(column);
      setSortDir(column === "symbol" ? "asc" : "desc");
    }
  };

  const sortedItems = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const time = (v: string | null) => (v ? new Date(v).getTime() : 0);
    return [...items].sort((a, b) => {
      const cmp =
        sortKey === "symbol"
          ? a.symbol.localeCompare(b.symbol)
          : sortKey === "price"
            ? (a.price ?? -Infinity) - (b.price ?? -Infinity)
            : sortKey === "asOf"
              ? time(a.yahooFetchedAt) - time(b.yahooFetchedAt)
              : (a.wealthScore ?? -1) - (b.wealthScore ?? -1);
      return cmp * dir;
    });
  }, [items, sortKey, sortDir]);

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/accounts/${accountId}/fundamentals/import-finviz`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) setImportMsg(data.error ?? "Import failed");
      else {
        setImportMsg(`Imported ${data.imported} symbol(s)${data.duplicatesSkipped ? ` (${data.duplicatesSkipped} duplicates skipped)` : ""}`);
        await fetchList();
      }
    } catch {
      setImportMsg("Network error during import");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const refresh = async (onlyFailed: boolean) => {
    await fetch(`/api/accounts/${accountId}/fundamentals/refresh-all${onlyFailed ? "?onlyFailed=true" : ""}`, { method: "POST" });
    await fetchList();
  };

  const scoreAll = async () => {
    setScoring(true);
    setScoreMsg(null);
    const res = await fetch(`/api/accounts/${accountId}/fundamentals/watchlist/score${lens ? `?lens=${lens}` : ""}`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setScoring(false);
    setScoreMsg(
      res.ok
        ? `Calculated ${d.scored} full score${d.scored === 1 ? "" : "s"}${d.remaining ? `; ${d.remaining} left, run it again to finish` : ""}${d.failed?.length ? `; couldn't score ${d.failed.join(", ")}` : ""}.`
        : (d.error ?? "Scoring failed")
    );
    await fetchList();
  };

  const addSymbol = async () => {
    if (!manualSymbol.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/fundamentals/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: manualSymbol.trim().toUpperCase() }),
      });
      if (res.ok) {
        setManualSymbol("");
        await fetchList();
      }
    } finally {
      setAdding(false);
    }
  };

  const failed = items.filter((i) => i.yahooFetchStatus === "ERROR").length;
  const passing = items.filter((i) => i.verdict === "PASS").length;
  const stale = items.filter((i) => !i.yahooFetchedAt || Date.now() - new Date(i.yahooFetchedAt).getTime() > STALE_MS).length;
  const lensName = getBuiltinLens(lens)?.name;

  return (
    <div className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Watchlist</h2>
            <p className="text-[11px] text-muted">
              {items.length} stocks · {passing} pass {lensName ? `the ${lensName} lens` : "your criteria"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                addSymbol();
              }}
            >
              <input
                value={manualSymbol}
                onChange={(e) => setManualSymbol(e.target.value.toUpperCase())}
                placeholder="Add ticker"
                className="w-28 px-3 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <Button type="submit" size="sm" disabled={adding || !manualSymbol.trim()} aria-label="Add ticker">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </form>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={importing} title="Import a Finviz screener CSV">
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Finviz CSV
            </Button>
            {items.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={scoreAll}
                disabled={scoring || hasPending}
                title="Calculate full scores (10-year SEC data, your DCFs and reports) for every stock"
              >
                {scoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {scoring ? "Scoring… (a minute or two)" : "Full scores"}
              </Button>
            )}
            {items.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => refresh(false)} disabled={hasPending} title="Pull fresh fundamentals for every stock">
                <RefreshCcw className={`w-3.5 h-3.5 ${hasPending ? "animate-spin" : ""}`} />
                {hasPending ? "Refreshing" : "Refresh all"}
              </Button>
            )}
          </div>
        </div>
        <LensPills value={lens} onChange={setLens} noneLabel="My criteria" />
        {!hasPending && (stale > 0 || failed > 0) && (
          <p className="text-[11px] text-warning">
            {stale > 0 && `${stale} with data older than 3 days. `}
            {failed > 0 && (
              <button type="button" onClick={() => refresh(true)} className="underline">
                Retry {failed} failed
              </button>
            )}
          </p>
        )}
        {scoreMsg && <p className="text-xs text-muted">{scoreMsg}</p>}
        {importMsg && <p className={`text-xs ${importMsg.startsWith("Imported") ? "text-success" : "text-danger"}`}>{importMsg}</p>}
      </div>

      {loading ? (
        <div className="p-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        </div>
      ) : items.length === 0 ? (
        <p className="p-8 text-center text-muted text-sm">
          No stocks yet. Add a ticker, import a Finviz screen, or ask the Analyst about one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium">
                <th className="px-4 py-2"><SortButton label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="px-4 py-2 text-muted font-medium">Verdict</th>
                <th className="px-4 py-2 text-right">
                  <span className="inline-flex items-center gap-1">
                    <SortButton label="Score" column="score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <InfoTip label={SCORE_NAME}>
                      0–100, weighted for the selected lens. Q = quick score from live metrics only (low confidence). Use “Full scores”, or open
                      a stock, to include 10-year SEC history, your DCF and the Company Report.
                    </InfoTip>
                  </span>
                </th>
                <th className="px-4 py-2 text-right"><SortButton label="Price" column="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="px-4 py-2 text-right hidden sm:table-cell"><SortButton label="Data as of" column="asOf" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => {
                const pending = item.yahooFetchStatus === "PENDING" || item.yahooFetchStatus === "FETCHING";
                const error = item.yahooFetchStatus === "ERROR";
                const v = VERDICT_STYLE[item.verdict] ?? VERDICT_STYLE.INSUFFICIENT_DATA;
                const isStale = !item.yahooFetchedAt || Date.now() - new Date(item.yahooFetchedAt).getTime() > STALE_MS;
                return (
                  <tr
                    key={item.id}
                    onClick={() => router.push(`/accounts/${accountId}/fundamentals/${encodeURIComponent(item.symbol)}`)}
                    className="border-b border-border/40 hover:bg-card-hover cursor-pointer transition-colors"
                    title={item.yahooFetchError ?? undefined}
                  >
                    <td className="px-4 py-2.5 font-semibold">{item.symbol}</td>
                    <td className="px-4 py-2.5">
                      {pending ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted">
                          <Loader2 className="w-3 h-3 animate-spin text-accent" /> Loading
                        </span>
                      ) : error ? (
                        <span className="flex items-center gap-1.5 text-xs text-danger">
                          <AlertCircle className="w-3 h-3" /> Fetch failed
                        </span>
                      ) : (
                        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${v.chip}`}>{v.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right num text-xs">
                      {item.wealthScore == null ? (
                        "—"
                      ) : (
                        <span className="inline-flex items-center gap-1" title={item.scoreQuick ? "Quick score (live metrics only)" : `Full score · ${item.scoreConfidence?.toLowerCase()} confidence`}>
                          <span className="font-semibold" style={{ color: scoreColor(item.wealthScore) }}>
                            {item.wealthScore}
                          </span>
                          {item.scoreQuick && <span className="text-[9px] text-muted">Q</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right num text-xs">{item.price != null ? `$${item.price.toFixed(2)}` : "—"}</td>
                    <td className={`px-4 py-2.5 text-right num text-xs hidden sm:table-cell ${isStale ? "text-warning" : "text-muted"}`}>
                      {item.yahooFetchedAt ? new Date(item.yahooFetchedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
