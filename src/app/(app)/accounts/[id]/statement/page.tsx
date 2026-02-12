"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  FileText,
  DollarSign,
  RefreshCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

interface OptionTradeDetail {
  id: string;
  callPut: string;
  strike: number | null;
  quantity: number;
  status: string;
  premiumReceived: number;
  premiumPaid: number;
  fees: number;
  netPremium: number;
  nrop: number | null;
  openedAt: string | null;
  closedAt: string | null;
  description: string;
}

interface StockTradeDetail {
  id: string;
  action: string;
  quantity: number;
  entryPrice: number | null;
  exitPrice: number | null;
  entryDateTime: string | null;
  exitDateTime: string | null;
  realizedPnl: number | null;
  description: string;
}

interface SymbolStatement {
  symbol: string;
  underlyingId: string;

  totalSharesBought: number;
  totalOriginalCost: number;
  totalPremiumReduction: number;
  soldSharesCostBasis: number;

  currentShares: number;
  currentOriginalCostBasis: number;
  currentPremiumReduction: number;
  currentAdjustedCostBasis: number;
  originalCostPerShare: number;
  adjustedCostPerShare: number;
  currentPrice: number | null;
  marketValue: number | null;

  plOpen: number | null;
  plOpenPct: number | null;
  realizedOptionPnl: number;
  realizedOptionPnlYtd: number;
  realizedStockPnl: number;
  realizedStockPnlYtd: number;
  totalRealizedPnl: number;
  totalPnl: number | null;

  openOptionCount: number;
  openOptionPremium: number;
  optionTrades: OptionTradeDetail[];
  stockTrades: StockTradeDetail[];
  closeValue: number | null;
}

interface StatementTotals {
  totalOriginalCost: number;
  totalPremiumReduction: number;
  currentCostBasis: number;
  marketValue: number | null;
  plOpen: number | null;
  realizedOptionPnl: number;
  realizedOptionPnlYtd: number;
  realizedStockPnl: number;
  realizedStockPnlYtd: number;
  totalRealizedPnl: number;
  totalPnl: number;
  closeValue: number | null;
}

interface StatementResponse {
  symbols: SymbolStatement[];
  totals: StatementTotals;
  cashBalance: number;
  cashflowReserve: number;
  equities: number | null;
}

// ── Helpers ────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSigned(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const prefix = n >= 0 ? "" : "-";
  return `${prefix}$${fmt(Math.abs(n))}`;
}

function pnlColor(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-muted";
  if (n > 0) return "text-success";
  if (n < 0) return "text-danger";
  return "text-foreground";
}

// ── Component ──────────────────────────────────────────────────

export default function AccountStatementPage() {
  const params = useParams();
  const accountId = params.id as string;

  const [data, setData] = useState<StatementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [showBySymbol, setShowBySymbol] = useState(true);

  const fetchStatement = async () => {
    const res = await fetch(`/api/accounts/${accountId}/statement`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
    }
    setLoading(false);
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/accounts/${accountId}/portfolio/refresh-prices`, {
        method: "POST",
      });
      await fetchStatement();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  if (loading) {
    return <div className="animate-pulse h-96 bg-card rounded-xl" />;
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted">Unable to load account statement.</p>
        <Link
          href={`/accounts/${accountId}`}
          className="text-accent hover:underline mt-2 inline-block"
        >
          Back to Account
        </Link>
      </div>
    );
  }

  const { symbols, totals, cashBalance, cashflowReserve, equities } = data;
  const totalCash = cashBalance + cashflowReserve;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/accounts/${accountId}`}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent" />
              <h1 className="text-2xl font-bold">Account Statement</h1>
            </div>
            <p className="text-sm text-muted mt-0.5">
              Profits &amp; Losses &middot; All-time &middot; by Symbol
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={refreshPrices}
          disabled={refreshing}
        >
          <RefreshCcw
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Refreshing…" : "Refresh Prices"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-success" />
            <p className="text-xs text-muted">Cash &amp; Sweep</p>
          </div>
          <p className="text-xl font-bold">${fmt(totalCash)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">Equities</p>
          <p className="text-xl font-bold">
            {equities !== null ? `$${fmt(equities)}` : "-"}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">Realized P/L</p>
          <p className={`text-xl font-bold ${pnlColor(totals.totalRealizedPnl)}`}>
            {fmtSigned(totals.totalRealizedPnl)}
          </p>
          <p className="text-[10px] text-muted mt-0.5">
            Option {fmtSigned(totals.realizedOptionPnl)} · Stock {fmtSigned(totals.realizedStockPnl)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">Unrealized P/L</p>
          <p className={`text-xl font-bold ${pnlColor(totals.plOpen)}`}>
            {totals.plOpen !== null ? fmtSigned(totals.plOpen) : "-"}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">Total P/L</p>
          <p className={`text-xl font-bold ${pnlColor(totals.totalPnl)}`}>
            {fmtSigned(totals.totalPnl)}
          </p>
        </Card>
      </div>

      {/* Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowBySymbol(true)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showBySymbol
              ? "bg-accent/10 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          by Symbol
        </button>
        <button
          onClick={() => setShowBySymbol(false)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !showBySymbol
              ? "bg-accent/10 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Summary
        </button>
      </div>

      {/* Profits & Losses Table */}
      {showBySymbol ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card-hover">
                  <th className="text-left p-3 font-medium text-muted w-8" />
                  <th className="text-left p-3 font-medium text-muted">
                    Symbol
                  </th>
                  <th className="text-right p-3 font-medium text-muted">
                    P/L Open
                  </th>
                  <th className="text-right p-3 font-medium text-muted">
                    P/L %
                  </th>
                  <th className="text-right p-3 font-medium text-muted">
                    P/L YTD
                  </th>
                  <th className="text-right p-3 font-medium text-muted">
                    Option P/L
                  </th>
                  <th className="text-right p-3 font-medium text-muted">
                    Stock P/L
                  </th>
                  <th className="text-right p-3 font-medium text-muted">
                    Cost Basis
                  </th>
                  <th className="text-right p-3 font-medium text-muted">
                    Close Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {symbols.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted">
                      No trading activity yet. Add stock or option positions to
                      see your statement.
                    </td>
                  </tr>
                ) : (
                  symbols.map((s) => {
                    const isExpanded = expandedSymbol === s.symbol;
                    const hasPosition = s.currentShares > 0;
                    const wasSold =
                      s.totalSharesBought > 0 && s.currentShares === 0;

                    return (
                      <SymbolRow
                        key={s.underlyingId}
                        s={s}
                        isExpanded={isExpanded}
                        hasPosition={hasPosition}
                        wasSold={wasSold}
                        onToggle={() =>
                          setExpandedSymbol(isExpanded ? null : s.symbol)
                        }
                      />
                    );
                  })
                )}
              </tbody>

              {/* Totals footer */}
              {symbols.length > 0 ? (
                <tfoot>
                  <tr className="bg-card-hover font-semibold border-t border-border">
                    <td className="p-3" />
                    <td className="p-3">OVERALL TOTALS</td>
                    <td className={`p-3 text-right ${pnlColor(totals.plOpen)}`}>
                      {totals.plOpen !== null ? fmtSigned(totals.plOpen) : "-"}
                    </td>
                    <td className="p-3 text-right" />
                    <td
                      className={`p-3 text-right ${pnlColor(totals.realizedOptionPnlYtd + totals.realizedStockPnlYtd)}`}
                    >
                      {fmtSigned(totals.realizedOptionPnlYtd + totals.realizedStockPnlYtd)}
                    </td>
                    <td
                      className={`p-3 text-right ${pnlColor(totals.realizedOptionPnl)}`}
                    >
                      {fmtSigned(totals.realizedOptionPnl)}
                    </td>
                    <td
                      className={`p-3 text-right ${pnlColor(totals.realizedStockPnl)}`}
                    >
                      {fmtSigned(totals.realizedStockPnl)}
                    </td>
                    <td className="p-3 text-right">
                      ${fmt(totals.currentCostBasis)}
                    </td>
                    <td className="p-3 text-right">
                      {totals.closeValue !== null
                        ? `$${fmt(totals.closeValue)}`
                        : "-"}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      ) : (
        <SummaryView data={data} />
      )}
    </div>
  );
}

// ── Symbol Row Component ───────────────────────────────────────

function SymbolRow({
  s,
  isExpanded,
  hasPosition,
  wasSold,
  onToggle,
}: {
  s: SymbolStatement;
  isExpanded: boolean;
  hasPosition: boolean;
  wasSold: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-border/50 hover:bg-card-hover cursor-pointer transition-colors ${
          !hasPosition ? "opacity-60" : ""
        }`}
        onClick={onToggle}
      >
        {/* Expand arrow */}
        <td className="p-3 text-muted">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </td>

        {/* Symbol + status */}
        <td className="p-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{s.symbol}</span>
            {hasPosition ? (
              <Badge variant="success">
                {s.currentShares} share{s.currentShares !== 1 ? "s" : ""}
              </Badge>
            ) : wasSold ? (
              <Badge variant="default">Closed</Badge>
            ) : null}
            {s.openOptionCount > 0 ? (
              <Badge variant="warning">
                {s.openOptionCount} open option
                {s.openOptionCount !== 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
        </td>

        {/* P/L Open */}
        <td className={`p-3 text-right ${pnlColor(s.plOpen)}`}>
          {s.plOpen !== null ? fmtSigned(s.plOpen) : "$0.00"}
        </td>

        {/* P/L % */}
        <td className={`p-3 text-right ${pnlColor(s.plOpenPct)}`}>
          {s.plOpenPct !== null ? `${s.plOpenPct >= 0 ? "+" : ""}${s.plOpenPct.toFixed(2)}%` : "0.00%"}
        </td>

        {/* P/L YTD (option + stock realized this year) */}
        <td className={`p-3 text-right ${pnlColor(s.realizedOptionPnlYtd + s.realizedStockPnlYtd)}`}>
          {fmtSigned(s.realizedOptionPnlYtd + s.realizedStockPnlYtd)}
        </td>

        {/* Option P/L (all time) */}
        <td className={`p-3 text-right ${pnlColor(s.realizedOptionPnl)}`}>
          {fmtSigned(s.realizedOptionPnl)}
        </td>

        {/* Stock P/L (all time) */}
        <td className={`p-3 text-right ${pnlColor(s.realizedStockPnl)}`}>
          {fmtSigned(s.realizedStockPnl)}
        </td>

        {/* Cost Basis */}
        <td className="p-3 text-right">
          {hasPosition ? `$${fmt(s.currentAdjustedCostBasis)}` : "$0.00"}
        </td>

        {/* Close Value */}
        <td className="p-3 text-right">
          {s.closeValue !== null ? `$${fmt(s.closeValue)}` : "$0.00"}
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded ? (
        <tr className="bg-background/50">
          <td colSpan={9} className="p-0">
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {/* Stock History */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Stock History
                  </p>
                  <div className="space-y-1">
                    <DetailRow
                      label="Total Shares Bought"
                      value={s.totalSharesBought.toString()}
                    />
                    <DetailRow
                      label="Original Cost"
                      value={`$${fmt(s.totalOriginalCost)}`}
                    />
                    <DetailRow
                      label="Shares Sold/Called"
                      value={(
                        s.totalSharesBought - s.currentShares
                      ).toString()}
                    />
                    <DetailRow
                      label="Cost Basis (Sold)"
                      value={`$${fmt(s.soldSharesCostBasis)}`}
                    />
                  </div>
                </div>

                {/* Current Position */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Current Position
                  </p>
                  <div className="space-y-1">
                    <DetailRow
                      label="Shares Held"
                      value={s.currentShares.toString()}
                    />
                    <DetailRow
                      label="Avg Cost/Share"
                      value={`$${fmt(s.originalCostPerShare)}`}
                    />
                    <DetailRow
                      label="Current Price"
                      value={
                        s.currentPrice !== null
                          ? `$${fmt(s.currentPrice)}`
                          : "—"
                      }
                    />
                    <DetailRow
                      label="Market Value"
                      value={
                        s.marketValue !== null ? `$${fmt(s.marketValue)}` : "—"
                      }
                    />
                  </div>
                </div>

                {/* Cost Basis Tracking */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Cost Basis Adjustments
                  </p>
                  <div className="space-y-1">
                    <DetailRow
                      label="Original Basis"
                      value={`$${fmt(s.currentOriginalCostBasis)}`}
                    />
                    <DetailRow
                      label="Premium Reduction"
                      value={
                        s.currentPremiumReduction > 0
                          ? `-$${fmt(s.currentPremiumReduction)}`
                          : "$0.00"
                      }
                      valueClass="text-success"
                    />
                    <DetailRow
                      label="Adjusted Basis"
                      value={`$${fmt(s.currentAdjustedCostBasis)}`}
                      bold
                    />
                    <DetailRow
                      label="Adj. Cost/Share"
                      value={`$${fmt(s.adjustedCostPerShare)}`}
                    />
                  </div>
                </div>

                {/* Options & Stock P/L */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Options &amp; Stock Activity
                  </p>
                  <div className="space-y-1">
                    <DetailRow
                      label="Option P/L"
                      value={fmtSigned(s.realizedOptionPnl)}
                      valueClass={pnlColor(s.realizedOptionPnl)}
                    />
                    <DetailRow
                      label="Stock P/L"
                      value={fmtSigned(s.realizedStockPnl)}
                      valueClass={pnlColor(s.realizedStockPnl)}
                    />
                    <DetailRow
                      label="YTD P/L"
                      value={fmtSigned(s.realizedOptionPnlYtd + s.realizedStockPnlYtd)}
                      valueClass={pnlColor(s.realizedOptionPnlYtd + s.realizedStockPnlYtd)}
                    />
                    <DetailRow
                      label="Open Positions"
                      value={s.openOptionCount.toString()}
                    />
                    {s.openOptionCount > 0 ? (
                      <DetailRow
                        label="Open Premium"
                        value={fmtSigned(s.openOptionPremium)}
                        valueClass={pnlColor(s.openOptionPremium)}
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Stock Trades Line Items */}
              {s.stockTrades && s.stockTrades.length > 0 ? (
                <div className="pt-3 border-t border-border/50">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Stock Trades
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left py-1.5 px-2 font-medium text-muted">Action</th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted">Qty</th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted">Entry</th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted">Exit</th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted">Realized P/L</th>
                          <th className="text-left py-1.5 px-2 font-medium text-muted">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.stockTrades.map((st) => (
                          <tr key={st.id} className="border-b border-border/20 hover:bg-card-hover/50">
                            <td className="py-1.5 px-2">
                              <Badge variant="core">{st.action}</Badge>
                            </td>
                            <td className="py-1.5 px-2 text-right">{st.quantity}</td>
                            <td className="py-1.5 px-2 text-right">
                              {st.entryPrice !== null ? `$${fmt(st.entryPrice)}` : "—"}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {st.exitPrice !== null ? `$${fmt(st.exitPrice)}` : "—"}
                            </td>
                            <td className={`py-1.5 px-2 text-right font-semibold ${pnlColor(st.realizedPnl)}`}>
                              {st.realizedPnl !== null ? fmtSigned(st.realizedPnl) : "—"}
                            </td>
                            <td className="py-1.5 px-2 text-muted">
                              {st.exitDateTime
                                ? new Date(st.exitDateTime).toLocaleDateString()
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Option Trades Line Items */}
              {s.optionTrades && s.optionTrades.length > 0 ? (
                <div className="pt-3 border-t border-border/50">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Option Trades
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left py-1.5 px-2 font-medium text-muted">Type</th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted">Strike</th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted">Contracts</th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted">Premium Received</th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted">Premium Paid</th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted">Net P/L</th>
                          <th className="text-left py-1.5 px-2 font-medium text-muted">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.optionTrades.map((ot) => (
                          <tr key={ot.id} className="border-b border-border/20 hover:bg-card-hover/50">
                            <td className="py-1.5 px-2">
                              <Badge variant={ot.callPut === "CALL" ? "warning" : "info"}>
                                {ot.callPut}
                              </Badge>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono">
                              {ot.strike !== null ? `$${fmt(ot.strike)}` : "—"}
                            </td>
                            <td className="py-1.5 px-2 text-right">{ot.quantity}</td>
                            <td className="py-1.5 px-2 text-right text-success">
                              {ot.premiumReceived > 0 ? `$${fmt(ot.premiumReceived)}` : "$0.00"}
                            </td>
                            <td className="py-1.5 px-2 text-right text-danger">
                              {ot.premiumPaid > 0 ? `$${fmt(ot.premiumPaid)}` : "$0.00"}
                            </td>
                            <td className={`py-1.5 px-2 text-right font-semibold ${pnlColor(ot.nrop ?? ot.netPremium)}`}>
                              {fmtSigned(ot.nrop ?? ot.netPremium)}
                            </td>
                            <td className="py-1.5 px-2">
                              <Badge variant={ot.status === "FINALIZED" ? "success" : "warning"}>
                                {ot.status === "FINALIZED" ? "Closed" : "Open"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Total P/L summary for this symbol */}
              <div className="flex items-center gap-6 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2">
                  {s.totalPnl !== null && s.totalPnl !== 0 ? (
                    s.totalPnl >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-success" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-danger" />
                    )
                  ) : null}
                  <span className="text-sm text-muted">Total P/L:</span>
                  <span
                    className={`text-sm font-semibold ${pnlColor(s.totalPnl)}`}
                  >
                    {s.totalPnl !== null ? fmtSigned(s.totalPnl) : "—"}
                  </span>
                </div>
                {s.totalPremiumReduction > 0 ? (
                  <div className="text-xs text-muted">
                    All-time premium reduction: ${fmt(s.totalPremiumReduction)}
                  </div>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ── Detail Row ─────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  valueClass,
  bold,
}: {
  label: string;
  value: string;
  valueClass?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span
        className={`${valueClass ?? "text-foreground"} ${bold ? "font-semibold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Summary View ───────────────────────────────────────────────

function SummaryView({ data }: { data: StatementResponse }) {
  const { totals, cashBalance, cashflowReserve, equities } = data;
  const totalCash = cashBalance + cashflowReserve;
  const totalAccountValue = (equities ?? 0) + totalCash;

  const rows = [
    {
      label: "Stock Positions (Market Value)",
      value: equities !== null ? `$${fmt(equities)}` : "—",
    },
    {
      label: "Original Cost Basis (All Positions)",
      value: `$${fmt(totals.totalOriginalCost)}`,
    },
    {
      label: "Premium Applied to Basis",
      value:
        totals.totalPremiumReduction > 0
          ? `-$${fmt(totals.totalPremiumReduction)}`
          : "$0.00",
      class: totals.totalPremiumReduction > 0 ? "text-success" : "",
    },
    {
      label: "Adjusted Cost Basis (Current Positions)",
      value: `$${fmt(totals.currentCostBasis)}`,
      bold: true,
    },
    { divider: true },
    {
      label: "Unrealized P/L (Open Positions)",
      value: totals.plOpen !== null ? fmtSigned(totals.plOpen) : "—",
      class: pnlColor(totals.plOpen),
    },
    {
      label: "Realized Option P/L (All Time)",
      value: fmtSigned(totals.realizedOptionPnl),
      class: pnlColor(totals.realizedOptionPnl),
    },
    {
      label: "Realized Stock P/L (All Time)",
      value: fmtSigned(totals.realizedStockPnl),
      class: pnlColor(totals.realizedStockPnl),
    },
    {
      label: "Realized P/L YTD",
      value: fmtSigned(totals.realizedOptionPnlYtd + totals.realizedStockPnlYtd),
      class: pnlColor(totals.realizedOptionPnlYtd + totals.realizedStockPnlYtd),
    },
    {
      label: "Total P/L",
      value: fmtSigned(totals.totalPnl),
      class: pnlColor(totals.totalPnl),
      bold: true,
    },
    { divider: true },
    {
      label: "Free Cash",
      value: `$${fmt(cashBalance)}`,
    },
    {
      label: "Cashflow Reserve",
      value: `$${fmt(cashflowReserve)}`,
    },
    {
      label: "Total Account Value",
      value: `$${fmt(totalAccountValue)}`,
      bold: true,
    },
  ];

  return (
    <Card>
      <div className="space-y-0">
        {rows.map((row, i) =>
          "divider" in row && row.divider ? (
            <div key={i} className="border-t border-border my-3" />
          ) : (
            <div
              key={i}
              className={`flex justify-between py-2 ${
                "bold" in row && row.bold ? "font-semibold" : ""
              }`}
            >
              <span className="text-muted">{"label" in row ? row.label : ""}</span>
              <span className={"class" in row && row.class ? row.class : "text-foreground"}>
                {"value" in row ? row.value : ""}
              </span>
            </div>
          )
        )}
      </div>
    </Card>
  );
}
