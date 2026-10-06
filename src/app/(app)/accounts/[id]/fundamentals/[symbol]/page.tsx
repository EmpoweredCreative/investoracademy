"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { RatioStatusDot, RygSummary } from "@/components/fundamentals/RatioStatusDot";
import { FundamentalChatPanel } from "@/components/fundamentals/FundamentalChatPanel";
import type { RatioStatus } from "@/lib/fundamentals/ratioBands";
import {
  ArrowLeft,
  RefreshCcw,
  ExternalLink,
  Loader2,
  Info,
} from "lucide-react";

interface ScoredRatio {
  key: string;
  name: string;
  value: number | null;
  formattedValue: string;
  score: { status: RatioStatus; label: string; warning?: string };
}

interface SymbolData {
  symbol: string;
  watchlistItem: { yahooFetchStatus: string; yahooFetchError: string | null } | null;
  snapshot: {
    fetchedAt: string;
    nextEarningsDate: string | null;
    price: number | null;
  } | null;
  ratios: ScoredRatio[];
  ryg: { green: number; yellow: number; red: number; gray: number };
}

export default function FundamentalSymbolPage() {
  const params = useParams();
  const accountId = params.id as string;
  const symbol = decodeURIComponent(params.symbol as string).toUpperCase();

  const [data, setData] = useState<SymbolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}`
    );
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }, [accountId, symbol]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const status = data?.watchlistItem?.yahooFetchStatus;
    if (status !== "PENDING" && status !== "FETCHING") return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [data?.watchlistItem?.yahooFetchStatus, load]);

  const refreshYahoo = async () => {
    setRefreshing(true);
    await fetch(
      `/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}/refresh`,
      { method: "POST" }
    );
    await load();
    setRefreshing(false);
  };

  const yahooReady =
    data?.watchlistItem?.yahooFetchStatus === "READY" && data?.snapshot != null;

  const finvizUrl = `https://finviz.com/quote.ashx?t=${symbol}`;
  const yahooUrl = `https://finance.yahoo.com/quote/${symbol}`;
  const googleUrl = `https://www.google.com/finance/quote/${symbol}:NASDAQ`;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Symbol not found.</p>
        <Link href={`/accounts/${accountId}/fundamentals`} className="text-accent text-sm mt-2 inline-block">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/accounts/${accountId}/fundamentals`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{symbol}</h1>
            {data.snapshot?.price != null && (
              <p className="text-muted text-sm">${data.snapshot.price.toFixed(2)}</p>
            )}
          </div>
          {yahooReady && (
            <Badge variant="success" className="ml-2">
              <RygSummary {...data.ryg} />
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={refreshYahoo} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCcw className="w-4 h-4" />
            )}
            Refresh Yahoo
          </Button>
          <a href={finvizUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">
              Finviz <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </a>
          <a href={yahooUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">
              Yahoo <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </a>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">
              Google earnings <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </a>
          <Link href={`/accounts/${accountId}/research?symbol=${symbol}`}>
            <Button size="sm">Trade Research</Button>
          </Link>
        </div>
      </div>

      {data.watchlistItem?.yahooFetchStatus === "FETCHING" ||
      data.watchlistItem?.yahooFetchStatus === "PENDING" ? (
        <Card className="p-4 flex items-center gap-3 text-sm text-muted">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          Fetching fundamentals from Yahoo…
        </Card>
      ) : null}

      {data.watchlistItem?.yahooFetchError && (
        <Card className="p-4 border-danger/30 bg-danger/5 text-sm text-danger">
          {data.watchlistItem.yahooFetchError}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold">Fundamentals</h2>
              {data.snapshot?.fetchedAt && (
                <span className="text-xs text-muted">
                  Updated {new Date(data.snapshot.fetchedAt).toLocaleString()}
                </span>
              )}
            </div>
            {data.snapshot?.nextEarningsDate && (
              <p className="px-4 py-2 text-xs text-muted border-b border-border">
                Next earnings: {data.snapshot.nextEarningsDate}
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-left">
                  <th className="px-4 py-2 font-medium w-8" />
                  <th className="px-4 py-2 font-medium">Metric</th>
                  <th className="px-4 py-2 font-medium">Value</th>
                  <th className="px-4 py-2 font-medium">Assessment</th>
                </tr>
              </thead>
              <tbody>
                {data.ratios.map((r) => (
                  <tr key={r.key} className="border-b border-border/40 hover:bg-card-hover/50">
                    <td className="px-4 py-2.5">
                      <RatioStatusDot status={r.score.status} />
                    </td>
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 font-mono">{r.formattedValue}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-muted">{r.score.label}</span>
                      {r.score.warning && (
                        <span
                          className="block text-xs text-amber-500/90 mt-0.5"
                          title={r.score.warning}
                        >
                          <Info className="w-3 h-3 inline mr-0.5" />
                          {r.score.warning}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted px-1">
            Indicators use Ultimate Fundamentals manual bands (green = favorable range, yellow =
            neutral/caution, red = concern). Educational only.
          </p>
        </div>

        <div className="lg:col-span-2">
          <FundamentalChatPanel
            accountId={accountId}
            symbol={symbol}
            disabled={!yahooReady}
            disabledReason={
              data.watchlistItem?.yahooFetchStatus === "ERROR"
                ? "Yahoo fetch failed — try Refresh Yahoo"
                : "Waiting for Yahoo fundamentals…"
            }
          />
        </div>
      </div>
    </div>
  );
}

