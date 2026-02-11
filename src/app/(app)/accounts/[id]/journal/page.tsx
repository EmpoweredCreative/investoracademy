"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, wheelCategoryBadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { ArrowLeft, PlusCircle, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";

interface JournalTrade {
  id: string;
  strike: string | null;
  callPut: string | null;
  longShort: string | null;
  quantity: string | null;
  entryPrice: string | null;
  entryDateTime: string | null;
  exitPrice: string | null;
  exitDateTime: string | null;
  thesisNotes: string | null;
  outcomeRating: string | null;
  wheelCategoryOverride: string | null;
  underlying: { symbol: string };
}

export default function JournalPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrades = (category?: string) => {
    const url = category
      ? `/api/accounts/${accountId}/journal?category=${category}`
      : `/api/accounts/${accountId}/journal`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setTrades(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTrades();
  }, [accountId]);

  const tabs = [
    { id: "all", label: "All Trades" },
    { id: "CORE", label: "Core" },
    { id: "MAD_MONEY", label: "Mad Money" },
    { id: "FREE_CAPITAL", label: "Free Capital" },
    { id: "RISK_MGMT", label: "Risk Mgmt" },
  ];

  const handleTabChange = (tabId: string) => {
    setLoading(true);
    fetchTrades(tabId === "all" ? undefined : tabId);
  };

  // Metrics
  const winners = trades.filter(
    (t) =>
      t.entryPrice &&
      t.exitPrice &&
      (t.longShort === "SHORT"
        ? parseFloat(t.exitPrice) < parseFloat(t.entryPrice)
        : parseFloat(t.exitPrice) > parseFloat(t.entryPrice))
  );
  const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/accounts/${accountId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Trade Journal</h1>
            <p className="text-muted text-sm">Track and review your trades</p>
          </div>
        </div>
        <Button size="sm">
          <PlusCircle className="w-4 h-4" />
          New Entry
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-2xl font-bold">{trades.length}</p>
          <p className="text-xs text-muted">Total Trades</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold">{winners.length}</p>
          <p className="text-xs text-muted">Winners</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-success">{winRate.toFixed(1)}%</p>
          <p className="text-xs text-muted">Win Rate</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold">{trades.length - winners.length}</p>
          <p className="text-xs text-muted">Losers</p>
        </Card>
      </div>

      {/* Tabs + Trades */}
      <Tabs tabs={tabs} onChange={handleTabChange}>
        {() =>
          loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-card rounded-lg" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-muted">No journal entries in this category.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {trades.map((trade) => {
                const pnl =
                  trade.entryPrice && trade.exitPrice
                    ? parseFloat(trade.exitPrice) - parseFloat(trade.entryPrice)
                    : null;
                const isProfit = pnl !== null && (trade.longShort === "SHORT" ? pnl < 0 : pnl > 0);

                return (
                  <Card key={trade.id} className="!p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{trade.underlying.symbol}</span>
                          {trade.strike && (
                            <span className="text-muted text-sm">
                              ${parseFloat(trade.strike).toFixed(2)} {trade.callPut}
                            </span>
                          )}
                          {trade.longShort && (
                            <Badge variant={trade.longShort === "SHORT" ? "warning" : "core"}>
                              {trade.longShort}
                            </Badge>
                          )}
                          {trade.wheelCategoryOverride && (
                            <Badge variant={wheelCategoryBadgeVariant(trade.wheelCategoryOverride)}>
                              {trade.wheelCategoryOverride.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        {trade.thesisNotes && (
                          <p className="text-sm text-muted line-clamp-2">{trade.thesisNotes}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted">
                          {trade.entryPrice && <span>Entry: ${parseFloat(trade.entryPrice).toFixed(2)}</span>}
                          {trade.exitPrice && <span>Exit: ${parseFloat(trade.exitPrice).toFixed(2)}</span>}
                          {trade.entryDateTime && (
                            <span>{new Date(trade.entryDateTime).toLocaleDateString()}</span>
                          )}
                          {trade.outcomeRating && (
                            <Badge
                              variant={
                                trade.outcomeRating === "EXCELLENT" || trade.outcomeRating === "GOOD"
                                  ? "success"
                                  : trade.outcomeRating === "POOR" || trade.outcomeRating === "TERRIBLE"
                                  ? "danger"
                                  : "default"
                              }
                            >
                              {trade.outcomeRating}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {pnl !== null && (
                        <div className={`flex items-center gap-1 font-medium ${isProfit ? "text-success" : "text-danger"}`}>
                          {isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          ${Math.abs(pnl).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        }
      </Tabs>
    </div>
  );
}
