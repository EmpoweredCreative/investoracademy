"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, wheelCategoryBadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ArrowLeft,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Target,
  ShieldAlert,
  X,
  Pencil,
  Trash2,
  BarChart3,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

interface JournalTrade {
  id: string;
  underlyingId: string;
  strike: string | null;
  callPut: string | null;
  longShort: string | null;
  quantity: string | null;
  entryDelta: string | null;
  entryPrice: string | null;
  entryDateTime: string | null;
  targetPrice: string | null;
  stopPrice: string | null;
  exitPrice: string | null;
  exitDateTime: string | null;
  thesisNotes: string | null;
  outcomeRating: string | null;
  wheelCategoryOverride: string | null;
  effectiveWheelCategory: string;
  underlying: { symbol: string };
}

interface UnderlyingOption {
  id: string;
  symbol: string;
}

interface DeltaBucket {
  label: string;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  avgEntryDelta: number;
}

interface TradeTypeInsight {
  callPut: "CALL" | "PUT";
  label: string;
  totalTrades: number;
  closedTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  deltaBreakdown: DeltaBucket[];
}

interface InsightsData {
  summary: {
    totalTrades: number;
    totalClosedTrades: number;
    totalPnl: number;
    avgPnl: number;
  };
  byType: TradeTypeInsight[];
}

type JournalEntryType = "LONG_STOCK" | "COVERED_CALL" | "SHORT_PUT";

const ENTRY_TYPE_OPTIONS: { value: JournalEntryType; label: string }[] = [
  { value: "LONG_STOCK", label: "Bought long stock" },
  { value: "COVERED_CALL", label: "Sold covered call" },
  { value: "SHORT_PUT", label: "Sold put" },
];

function toLocalDatetime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function deriveEntryType(trade: JournalTrade): JournalEntryType {
  if (trade.longShort === "SHORT" && trade.callPut === "CALL") return "COVERED_CALL";
  if (trade.longShort === "SHORT" && trade.callPut === "PUT") return "SHORT_PUT";
  return "LONG_STOCK";
}

export default function JournalPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [underlyings, setUnderlyings] = useState<UnderlyingOption[]>([]);

  // Modal state — shared between create and edit
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<JournalTrade | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Insights state
  const [showInsights, setShowInsights] = useState(false);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [form, setForm] = useState({
    entryType: "LONG_STOCK" as JournalEntryType,
    underlyingId: "",
    strike: "",
    quantity: "1",
    entryDelta: "",
    entryPrice: "",
    entryDateTime: "",
    targetPrice: "",
    stopPrice: "",
    exitPrice: "",
    exitDateTime: "",
    fees: "",
    thesisNotes: "",
    outcomeRating: "NEUTRAL" as "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "TERRIBLE",
  });

  // ── Data fetching ──────────────────────────────────────────

  const fetchTrades = (type?: string) => {
    const url = type
      ? `/api/accounts/${accountId}/journal?type=${type}`
      : `/api/accounts/${accountId}/journal`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setTrades(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };

  const fetchInsights = () => {
    setInsightsLoading(true);
    fetch(`/api/accounts/${accountId}/journal/insights`)
      .then((r) => r.json())
      .then((data) => {
        setInsights(data);
        setInsightsLoading(false);
      })
      .catch(() => setInsightsLoading(false));
  };

  const toggleInsights = () => {
    if (!showInsights && !insights) {
      fetchInsights();
    }
    setShowInsights((prev) => !prev);
  };

  const fetchUnderlyings = () => {
    fetch(`/api/accounts/${accountId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.underlyings) setUnderlyings(data.underlyings);
      });
  };

  useEffect(() => {
    fetchTrades();
    fetchUnderlyings();
  }, [accountId]);

  // ── Open create modal ──────────────────────────────────────

  const openCreateModal = (entryType: JournalEntryType) => {
    setSubmitError("");
    setEditingTradeId(null);
    setForm({
      entryType,
      underlyingId: underlyings[0]?.id ?? "",
      strike: "",
      quantity: "1",
      entryDelta: "",
      entryPrice: "",
      entryDateTime: "",
      targetPrice: "",
      stopPrice: "",
      exitPrice: "",
      exitDateTime: "",
      fees: "",
      thesisNotes: "",
      outcomeRating: "NEUTRAL",
    });
    setModalMode("create");
  };

  // ── Open edit modal ────────────────────────────────────────

  const openEditModal = (trade: JournalTrade) => {
    setSubmitError("");
    setEditingTradeId(trade.id);

    // Ensure the trade's underlying is in the dropdown list
    if (!underlyings.some((u) => u.id === trade.underlyingId)) {
      setUnderlyings((prev) => [
        ...prev,
        { id: trade.underlyingId, symbol: trade.underlying.symbol },
      ]);
    }

    setForm({
      entryType: deriveEntryType(trade),
      underlyingId: trade.underlyingId,
      strike: trade.strike ? parseFloat(trade.strike).toString() : "",
      quantity: trade.quantity ? parseFloat(trade.quantity).toString() : "1",
      entryDelta: trade.entryDelta ? parseFloat(trade.entryDelta).toString() : "",
      entryPrice: trade.entryPrice ? parseFloat(trade.entryPrice).toString() : "",
      entryDateTime: toLocalDatetime(trade.entryDateTime),
      targetPrice: trade.targetPrice ? parseFloat(trade.targetPrice).toString() : "",
      stopPrice: trade.stopPrice ? parseFloat(trade.stopPrice).toString() : "",
      exitPrice: trade.exitPrice ? parseFloat(trade.exitPrice).toString() : "",
      exitDateTime: toLocalDatetime(trade.exitDateTime),
      fees: "", // fees live in LedgerEntry, not JournalTrade; edit would need ledger lookup
      thesisNotes: trade.thesisNotes ?? "",
      outcomeRating: (trade.outcomeRating as typeof form.outcomeRating) ?? "NEUTRAL",
    });
    setModalMode("edit");
  };

  // ── Submit (create or edit) ────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const isEdit = modalMode === "edit";
      const body: Record<string, unknown> = {
        underlyingId: form.underlyingId,
        outcomeRating: form.outcomeRating,
      };
      if (form.entryType === "LONG_STOCK") {
        body.longShort = "LONG";
      } else {
        body.longShort = "SHORT";
        body.callPut = form.entryType === "COVERED_CALL" ? "CALL" : "PUT";
        if (form.strike) body.strike = parseFloat(form.strike);
        if (form.entryDelta) body.entryDelta = parseFloat(form.entryDelta);
        else if (isEdit) body.entryDelta = null;
        if (form.fees) body.fees = parseFloat(form.fees);
      }
      if (form.quantity) body.quantity = parseInt(form.quantity, 10);
      if (form.entryPrice) body.entryPrice = parseFloat(form.entryPrice);
      if (form.entryDateTime) body.entryDateTime = new Date(form.entryDateTime).toISOString();
      if (form.targetPrice) body.targetPrice = parseFloat(form.targetPrice);
      else if (isEdit) body.targetPrice = null;
      if (form.stopPrice) body.stopPrice = parseFloat(form.stopPrice);
      else if (isEdit) body.stopPrice = null;
      if (form.exitPrice) body.exitPrice = parseFloat(form.exitPrice);
      else if (isEdit) body.exitPrice = null;
      if (form.exitDateTime) body.exitDateTime = new Date(form.exitDateTime).toISOString();
      else if (isEdit) body.exitDateTime = null;
      if (form.thesisNotes) body.thesisNotes = form.thesisNotes;
      else if (isEdit) body.thesisNotes = null;

      if (isEdit && editingTradeId) {
        body.tradeId = editingTradeId;
      }

      const res = await fetch(`/api/accounts/${accountId}/journal`, {
        method: modalMode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Something went wrong");
        setSubmitting(false);
        return;
      }
      setModalMode(null);
      fetchTrades();
    } catch {
      setSubmitError("Something went wrong");
    }
    setSubmitting(false);
  };

  // ── Delete ─────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/journal?tradeId=${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setDeleteTarget(null);
        fetchTrades();
      }
    } catch {
      // silently fail — modal stays open so user can retry
    }
    setDeleting(false);
  };

  // ── Tabs ───────────────────────────────────────────────────

  const tabs = [
    { id: "all", label: "All Trades" },
    { id: "stock", label: "Stock" },
    { id: "options", label: "Options" },
  ];

  const handleTabChange = (tabId: string) => {
    setLoading(true);
    fetchTrades(tabId === "all" ? undefined : tabId);
  };

  // ── Metrics ────────────────────────────────────────────────

  const winners = trades.filter(
    (t) =>
      t.entryPrice &&
      t.exitPrice &&
      (t.longShort === "SHORT"
        ? parseFloat(t.exitPrice) < parseFloat(t.entryPrice)
        : parseFloat(t.exitPrice) > parseFloat(t.entryPrice))
  );
  const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;

  // ── Modal title ────────────────────────────────────────────

  const modalTitle = modalMode === "edit" ? "Edit Journal Entry" : "New Journal Entry";
  const modalSubmitLabel = modalMode === "edit" ? "Save Changes" : "Create Entry";

  return (
    <div className="space-y-8">
      {/* Header with +Stock and +Option buttons */}
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
        <div className="flex gap-2">
          <Link href={`/accounts/${accountId}/add/stock`}>
            <Button variant="secondary" size="sm">
              <PlusCircle className="w-4 h-4" />
              Stock
            </Button>
          </Link>
          <Link href={`/accounts/${accountId}/add/option`}>
            <Button size="sm">
              <PlusCircle className="w-4 h-4" />
              Option
            </Button>
          </Link>
        </div>
      </div>

      {/* Create / Edit modal */}
      {modalMode !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">{modalTitle}</h2>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-muted hover:text-foreground p-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {submitError && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                  {submitError}
                </div>
              )}
              <Select
                label="Entry type"
                value={form.entryType}
                onChange={(e) => setForm((f) => ({ ...f, entryType: e.target.value as JournalEntryType }))}
                options={ENTRY_TYPE_OPTIONS}
                required
              />
              <Select
                label="Underlying"
                value={form.underlyingId}
                onChange={(e) => setForm((f) => ({ ...f, underlyingId: e.target.value }))}
                options={[
                  { value: "", label: "Select symbol..." },
                  ...underlyings.map((u) => ({ value: u.id, label: u.symbol })),
                ]}
                required
              />
              {(form.entryType === "COVERED_CALL" || form.entryType === "SHORT_PUT") && (
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Strike"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 180"
                    value={form.strike}
                    onChange={(e) => setForm((f) => ({ ...f, strike: e.target.value }))}
                    required
                  />
                  <Input
                    label="Delta"
                    type="number"
                    step="0.01"
                    min="-1"
                    max="1"
                    placeholder="e.g. 0.30"
                    value={form.entryDelta}
                    onChange={(e) => setForm((f) => ({ ...f, entryDelta: e.target.value }))}
                  />
                </div>
              )}
              <Input
                label="Quantity"
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Entry price"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 2.80"
                  value={form.entryPrice}
                  onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))}
                />
                <Input
                  label="Entry date"
                  type="datetime-local"
                  value={form.entryDateTime}
                  onChange={(e) => setForm((f) => ({ ...f, entryDateTime: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Target price"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 15.00"
                  value={form.targetPrice}
                  onChange={(e) => setForm((f) => ({ ...f, targetPrice: e.target.value }))}
                />
                <Input
                  label="Stop loss"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 10.00"
                  value={form.stopPrice}
                  onChange={(e) => setForm((f) => ({ ...f, stopPrice: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Exit price"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 0"
                  value={form.exitPrice}
                  onChange={(e) => setForm((f) => ({ ...f, exitPrice: e.target.value }))}
                />
                <Input
                  label="Exit date"
                  type="datetime-local"
                  value={form.exitDateTime}
                  onChange={(e) => setForm((f) => ({ ...f, exitDateTime: e.target.value }))}
                />
              </div>
              {(form.entryType === "COVERED_CALL" || form.entryType === "SHORT_PUT") && (
                <Input
                  label="Total fees"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 0.65"
                  value={form.fees}
                  onChange={(e) => setForm((f) => ({ ...f, fees: e.target.value }))}
                />
              )}
              <Select
                label="Outcome rating"
                value={form.outcomeRating}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    outcomeRating: e.target.value as typeof form.outcomeRating,
                  }))
                }
                options={[
                  { value: "EXCELLENT", label: "Excellent" },
                  { value: "GOOD", label: "Good" },
                  { value: "NEUTRAL", label: "Neutral" },
                  { value: "POOR", label: "Poor" },
                  { value: "TERRIBLE", label: "Terrible" },
                ]}
              />
              <Input
                label="Thesis notes"
                placeholder="Trade thesis and notes..."
                value={form.thesisNotes}
                onChange={(e) => setForm((f) => ({ ...f, thesisNotes: e.target.value }))}
              />
              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={submitting}>
                  {modalSubmitLabel}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setModalMode(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete journal entry?"
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        <p>
          This will permanently delete the{" "}
          <span className="font-medium text-foreground">
            {deleteTarget?.underlying.symbol}
          </span>
          {deleteTarget?.strike
            ? ` $${parseFloat(deleteTarget.strike).toFixed(2)} ${deleteTarget.callPut}`
            : " stock"}{" "}
          journal entry. This cannot be undone.
        </p>
      </ConfirmDialog>

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

      {/* Option Performance Insights */}
      <Card>
        <button
          type="button"
          onClick={toggleInsights}
          className="w-full flex items-center justify-between p-0"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-accent" />
            <span className="font-semibold">Option Performance by Delta</span>
          </div>
          {showInsights ? (
            <ChevronDown className="w-5 h-5 text-muted" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted" />
          )}
        </button>

        {showInsights && (
          <div className="mt-4 space-y-6">
            {insightsLoading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-8 bg-card rounded" />
                <div className="h-32 bg-card rounded" />
              </div>
            ) : !insights || insights.summary.totalTrades === 0 ? (
              <p className="text-muted text-sm py-4">
                No option trades with delta recorded yet. Add delta when entering option trades to see performance insights here.
              </p>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-background p-3">
                    <p className="text-lg font-bold">{insights.summary.totalTrades}</p>
                    <p className="text-xs text-muted">Trades with Delta</p>
                  </div>
                  <div className="rounded-lg bg-background p-3">
                    <p className={`text-lg font-bold ${insights.summary.totalPnl >= 0 ? "text-success" : "text-danger"}`}>
                      {insights.summary.totalPnl >= 0 ? "+" : "-"}$
                      {Math.abs(insights.summary.totalPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted">Total Option P/L</p>
                  </div>
                  <div className="rounded-lg bg-background p-3">
                    <p className={`text-lg font-bold ${insights.summary.avgPnl >= 0 ? "text-success" : "text-danger"}`}>
                      {insights.summary.avgPnl >= 0 ? "+" : "-"}$
                      {Math.abs(insights.summary.avgPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted">Avg P/L per Trade</p>
                  </div>
                </div>

                {/* By trade type */}
                {insights.byType.map((typeInsight) => (
                  <div key={typeInsight.callPut} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">{typeInsight.label}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span>{typeInsight.totalTrades} trades</span>
                        <span className="text-success">{typeInsight.winRate}% win rate</span>
                        <span className={typeInsight.totalPnl >= 0 ? "text-success" : "text-danger"}>
                          {typeInsight.totalPnl >= 0 ? "+" : "-"}$
                          {Math.abs(typeInsight.totalPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {typeInsight.deltaBreakdown.length === 0 ? (
                      <p className="text-xs text-muted">No delta data recorded for these trades yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-xs text-muted">
                              <th className="py-2 px-3 text-left font-medium">Delta Range</th>
                              <th className="py-2 px-3 text-right font-medium">Trades</th>
                              <th className="py-2 px-3 text-right font-medium">Win Rate</th>
                              <th className="py-2 px-3 text-right font-medium">Avg P/L</th>
                              <th className="py-2 px-3 text-right font-medium">Total P/L</th>
                              <th className="py-2 px-3 text-right font-medium">W / L</th>
                            </tr>
                          </thead>
                          <tbody>
                            {typeInsight.deltaBreakdown.map((bucket) => (
                              <tr
                                key={bucket.label}
                                className="border-b border-border/50 hover:bg-card-hover transition-colors"
                              >
                                <td className="py-2 px-3 font-medium">{bucket.label}</td>
                                <td className="py-2 px-3 text-right">
                                  {bucket.totalTrades}
                                  {bucket.openTrades > 0 && (
                                    <span className="text-muted text-xs ml-1">
                                      ({bucket.openTrades} open)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {bucket.closedTrades > 0 ? (
                                    <span className={bucket.winRate >= 50 ? "text-success" : "text-danger"}>
                                      {bucket.winRate}%
                                    </span>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {bucket.closedTrades > 0 ? (
                                    <span className={bucket.avgPnl >= 0 ? "text-success" : "text-danger"}>
                                      {bucket.avgPnl >= 0 ? "+" : "-"}$
                                      {Math.abs(bucket.avgPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {bucket.closedTrades > 0 ? (
                                    <span className={bucket.totalPnl >= 0 ? "text-success font-medium" : "text-danger font-medium"}>
                                      {bucket.totalPnl >= 0 ? "+" : "-"}$
                                      {Math.abs(bucket.totalPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right text-xs">
                                  <span className="text-success">{bucket.winners}W</span>
                                  {" / "}
                                  <span className="text-danger">{bucket.losers}L</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}

              </>
            )}
          </div>
        )}
      </Card>

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
                const isShort = trade.longShort === "SHORT";
                const qty = trade.quantity ? parseFloat(trade.quantity) : 1;
                const entry = trade.entryPrice ? parseFloat(trade.entryPrice) : null;
                const exit = trade.exitPrice ? parseFloat(trade.exitPrice) : null;
                const target = trade.targetPrice ? parseFloat(trade.targetPrice) : null;
                const stop = trade.stopPrice ? parseFloat(trade.stopPrice) : null;

                // Actual P/L (closed trade)
                const pnl =
                  entry !== null && exit !== null
                    ? (isShort ? -(exit - entry) : exit - entry) * qty
                    : null;
                const isProfit = pnl !== null && pnl > 0;

                // Potential profit (based on target)
                const potentialProfit =
                  entry !== null && target !== null
                    ? (isShort ? -(target - entry) : target - entry) * qty
                    : null;

                // Max risk (based on stop loss)
                const maxRisk =
                  entry !== null && stop !== null
                    ? (isShort ? stop - entry : entry - stop) * qty
                    : null;

                const fmtDollars = (v: number) =>
                  Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                return (
                  <Card key={trade.id} className="!p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Row 1: Symbol, strike, badges */}
                        <div className="flex items-center gap-2 flex-wrap">
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
                          <Badge variant={wheelCategoryBadgeVariant(trade.effectiveWheelCategory)}>
                            {trade.effectiveWheelCategory.split("_").join(" ")}
                          </Badge>
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

                        {/* Row 2: Thesis notes */}
                        {trade.thesisNotes && (
                          <p className="text-sm text-muted line-clamp-2">{trade.thesisNotes}</p>
                        )}

                        {/* Row 3: Price details */}
                        <div className="flex items-center gap-4 text-xs text-muted flex-wrap">
                          {entry !== null && <span>Entry: ${entry.toFixed(2)}</span>}
                          {trade.entryDelta && (
                            <span>Delta: {parseFloat(trade.entryDelta).toFixed(2)}</span>
                          )}
                          {target !== null && (
                            <span className="flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              Target: ${target.toFixed(2)}
                            </span>
                          )}
                          {stop !== null && (
                            <span className="flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" />
                              Stop: ${stop.toFixed(2)}
                            </span>
                          )}
                          {exit !== null && <span>Exit: ${exit.toFixed(2)}</span>}
                          {trade.quantity && <span>Qty: {parseFloat(trade.quantity)}</span>}
                          {trade.entryDateTime && (
                            <span>{new Date(trade.entryDateTime).toLocaleDateString()}</span>
                          )}
                        </div>

                        {/* Row 4: Potential profit / Max risk (for open trades) */}
                        {(potentialProfit !== null || maxRisk !== null) && pnl === null && (
                          <div className="flex items-center gap-4 text-xs flex-wrap">
                            {potentialProfit !== null && (
                              <span className="text-success flex items-center gap-1">
                                <Target className="w-3 h-3" />
                                Potential profit: +${fmtDollars(potentialProfit)}
                              </span>
                            )}
                            {maxRisk !== null && (
                              <span className="text-danger flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3" />
                                Max risk: -${fmtDollars(maxRisk)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right side: P/L + actions */}
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        {pnl !== null ? (
                          <div className={`flex flex-col items-end text-right ${isProfit ? "text-success" : "text-danger"}`}>
                            <div className="flex items-center gap-1 font-semibold text-sm">
                              {isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              {isProfit ? "+" : "-"}${fmtDollars(pnl)}
                            </div>
                            <span className="text-[10px] font-medium opacity-75">
                              {isProfit ? "PROFIT" : "LOSS"}
                            </span>
                          </div>
                        ) : potentialProfit !== null ? (
                          <div className="flex flex-col items-end text-right text-muted">
                            <div className="flex items-center gap-1 font-medium text-xs">
                              <Target className="w-3.5 h-3.5" />
                              +${fmtDollars(potentialProfit)}
                            </div>
                            <span className="text-[10px] opacity-75">POTENTIAL</span>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEditModal(trade)}
                          className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                          aria-label="Edit entry"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(trade)}
                          className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-card-hover transition-colors"
                          aria-label="Delete entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
