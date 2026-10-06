"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RygSummary } from "@/components/fundamentals/RatioStatusDot";
import {
  ArrowLeft,
  Upload,
  RefreshCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

type SortKey = "symbol" | "price" | "importedAt" | "ryg";
type SortDir = "asc" | "desc";

function SortableHeader({
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
  return (
    <th className={`px-4 py-3 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1.5 transition-colors ${
          active ? "text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5" aria-hidden />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

interface WatchlistItem {
  id: string;
  symbol: string;
  yahooFetchStatus: string;
  yahooFetchError: string | null;
  yahooFetchedAt: string | null;
  importedAt: string;
  source: string;
  ryg: { green: number; yellow: number; red: number; gray: number };
  price: number | null;
}

function YahooStatusIcon({ status }: { status: string }) {
  if (status === "READY")
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-label="Ready" />;
  if (status === "FETCHING" || status === "PENDING")
    return <Loader2 className="w-4 h-4 text-accent animate-spin" aria-label="Loading" />;
  if (status === "ERROR")
    return <AlertCircle className="w-4 h-4 text-danger" aria-label="Error" />;
  return <Clock className="w-4 h-4 text-muted" aria-label="Pending" />;
}

export default function FundamentalsListPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;

  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [manualSymbol, setManualSymbol] = useState("");
  const [adding, setAdding] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleSort = (column: SortKey) => {
    if (sortKey === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column);
      setSortDir(column === "importedAt" ? "desc" : "asc");
    }
  };

  const sortedItems = useMemo(() => {
    const copy = [...items];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "price":
          cmp = (a.price ?? -Infinity) - (b.price ?? -Infinity);
          break;
        case "importedAt":
          cmp =
            new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime();
          break;
        case "ryg": {
          const score = (r: WatchlistItem["ryg"]) =>
            r.green * 100 + r.yellow * 10 - r.red * 100 - r.gray;
          cmp = score(a.ryg) - score(b.ryg);
          break;
        }
      }
      return cmp * dir;
    });
    return copy;
  }, [items, sortKey, sortDir]);

  const fetchList = useCallback(async () => {
    const res = await fetch(`/api/accounts/${accountId}/fundamentals/watchlist`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const hasPending = items.some(
      (i) => i.yahooFetchStatus === "PENDING" || i.yahooFetchStatus === "FETCHING"
    );
    if (hasPending) {
      pollRef.current = setInterval(fetchList, 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [items, fetchList]);

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/accounts/${accountId}/fundamentals/import-finviz`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setImportMsg(data.error ?? "Import failed");
      } else {
        setImportMsg(
          `Imported ${data.imported} symbol(s)${
            data.duplicatesSkipped ? ` (${data.duplicatesSkipped} duplicates skipped)` : ""
          } — fetching Yahoo data…`
        );
        await fetchList();
      }
    } catch {
      setImportMsg("Network error during import");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const refreshAll = async () => {
    await fetch(`/api/accounts/${accountId}/fundamentals/refresh-all?onlyFailed=true`, {
      method: "POST",
    });
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/accounts/${accountId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Fundamental Research</h1>
            <p className="text-muted text-sm">
              Step 1: Import Finviz CSV → Step 2: Yahoo fundamentals → Step 3: Analyze symbols
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={refreshAll}>
          <RefreshCcw className="w-4 h-4" />
          Retry failed
        </Button>
      </div>

      <Card className="p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-sm mb-1">Import from Finviz</h2>
          <p className="text-xs text-muted mb-3">
            Export your screener to CSV in Finviz, then upload here. Yahoo will pull fundamentals
            for each symbol automatically.
          </p>
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
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {importing ? "Importing…" : "Upload Finviz CSV"}
          </Button>
          {importMsg && (
            <p
              className={`text-sm mt-2 ${
                importMsg.startsWith("Imported") ? "text-success" : "text-danger"
              }`}
            >
              {importMsg}
            </p>
          )}
        </div>

        <div className="flex gap-2 items-end border-t border-border pt-4">
          <div className="flex-1 max-w-xs">
            <Input
              label="Add symbol manually"
              placeholder="e.g. AAPL"
              value={manualSymbol}
              onChange={(e) => setManualSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addSymbol()}
            />
          </div>
          <Button onClick={addSymbol} disabled={adding || !manualSymbol.trim()} size="sm">
            Add
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted" />
          </div>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-muted text-sm">
            No symbols yet. Upload a Finviz screener CSV to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <SortableHeader
                    label="Symbol"
                    column="symbol"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th className="px-4 py-3 font-medium text-muted">Yahoo</th>
                  <SortableHeader
                    label="R / Y / G"
                    column="ryg"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Price"
                    column="price"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Imported"
                    column="importedAt"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border/50 hover:bg-card-hover cursor-pointer transition-colors"
                    onClick={() =>
                      router.push(
                        `/accounts/${accountId}/fundamentals/${encodeURIComponent(item.symbol)}`
                      )
                    }
                  >
                    <td className="px-4 py-3 font-semibold">{item.symbol}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <YahooStatusIcon status={item.yahooFetchStatus} />
                        <span className="text-xs text-muted capitalize">
                          {item.yahooFetchStatus.toLowerCase()}
                        </span>
                      </div>
                      {item.yahooFetchError && (
                        <p className="text-xs text-danger mt-0.5 truncate max-w-[200px]">
                          {item.yahooFetchError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.yahooFetchStatus === "READY" ? (
                        <RygSummary {...item.ryg} />
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.price != null ? `$${item.price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {new Date(item.importedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
