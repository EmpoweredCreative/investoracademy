"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  TrendingUp,
  TrendingDown,
  PlusCircle,
  PieChart,
  BookOpen,
  Microscope,
  RefreshCcw,
  Upload,
  DollarSign,
  Pencil,
  Check,
  X,
  Briefcase,
  Trash2,
  ChevronDown,
  ChevronRight,
  FileText,
  Banknote,
  Info,
  Archive,
  AlertTriangle,
} from "lucide-react";

interface AccountDetail {
  id: string;
  name: string;
  mode: string;
  defaultPolicy: string | null;
  cashBalance: string;
  cashflowReserve: string;
  onboardingCompletedAt: string | null;
  archivedAt: string | null;
  underlyings: Array<{ id: string; symbol: string }>;
  _count: {
    strategyInstances: number;
    ledgerEntries: number;
    reinvestSignals: number;
    journalTrades: number;
    researchIdeas: number;
  };
}

type PremiumPolicy = "CASHFLOW" | "BASIS_REDUCTION" | "REINVEST_ON_CLOSE";

interface OptionTradeDetail {
  id: string;
  journalTradeId: string | null;
  callPut: string;
  strike: number | null;
  quantity: number;
  status: string;
  premiumReceived: number;
  premiumPaid: number;
  fees: number;
  netPremium: number;
  nrop: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  entryDateTime: string | null;
  exitDateTime: string | null;
}

interface PortfolioPosition {
  underlyingId: string;
  symbol: string;
  premiumPolicy: PremiumPolicy | null;
  shares: number;
  avgCostPerShare: number;
  adjustedCostPerShare: number;
  totalCostBasis: number;
  originalCostBasis: number;
  totalPremiumReduction: number;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  originalPnl: number | null;
  originalPnlPct: number | null;
  lotCount: number;
  optionTrades?: OptionTradeDetail[];
}

interface PortfolioSummary {
  positionCount: number;
  totalCostBasis: number;
  totalOriginalCostBasis: number;
  totalMarketValue: number | null;
  cashBalance: number;
  cashflowReserve: number;
}

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Cash editing
  const [editingCash, setEditingCash] = useState(false);
  const [cashForm, setCashForm] = useState({ cashBalance: "", cashflowReserve: "" });
  const [savingCash, setSavingCash] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);

  // Inline price editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  // Refresh prices from Yahoo
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  // Delete position
  const [deleteTarget, setDeleteTarget] = useState<PortfolioPosition | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Account default policy editing
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  // Premium strategy editing
  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null);
  const [savingStrategy, setSavingStrategy] = useState(false);

  // Expanded position for option trade details
  const [expandedPositionId, setExpandedPositionId] = useState<string | null>(null);

  // Inline option trade editing (close trade from portfolio)
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [optionExitPrice, setOptionExitPrice] = useState("");
  const [optionExitDate, setOptionExitDate] = useState("");
  const [savingOption, setSavingOption] = useState(false);
  const [optionError, setOptionError] = useState<string | null>(null);

  // Onboarding confirmation
  const [showOnboardingConfirm, setShowOnboardingConfirm] = useState(false);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);

  // Archive account
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archivingAccount, setArchivingAccount] = useState(false);

  // Deposit form
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: "", occurredAt: new Date().toISOString().slice(0, 16), notes: "" });
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  const openCashEdit = () => {
    setCashForm({
      cashBalance: account ? parseFloat(account.cashBalance).toString() : "0",
      cashflowReserve: account ? parseFloat(account.cashflowReserve).toString() : "0",
    });
    setCashError(null);
    setEditingCash(true);
  };

  const cancelCashEdit = () => {
    setEditingCash(false);
    setCashError(null);
  };

  const saveCash = async () => {
    setSavingCash(true);
    setCashError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashBalance: parseFloat(cashForm.cashBalance || "0"),
          cashflowReserve: parseFloat(cashForm.cashflowReserve || "0"),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAccount((prev) =>
          prev
            ? { ...prev, cashBalance: updated.cashBalance, cashflowReserve: updated.cashflowReserve }
            : prev
        );
        // Also refresh portfolio summary since cash values affect totals
        await fetchPortfolio();
        setEditingCash(false);
      } else {
        const errBody = await res.json().catch(() => null);
        setCashError(errBody?.error ?? `Save failed (${res.status})`);
      }
    } catch {
      setCashError("Network error — check your connection and try again.");
    } finally {
      setSavingCash(false);
    }
  };

  const savePolicy = async (newPolicy: PremiumPolicy | null) => {
    if (!account || newPolicy === account.defaultPolicy) {
      setEditingPolicy(false);
      return;
    }
    setSavingPolicy(true);
    setPolicyError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultPolicy: newPolicy }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAccount((prev) =>
          prev ? { ...prev, defaultPolicy: updated.defaultPolicy ?? null } : prev
        );
      } else {
        const errBody = await res.json().catch(() => null);
        setPolicyError(errBody?.error ?? `Save failed (${res.status})`);
      }
    } catch {
      setPolicyError("Network error — could not save.");
    } finally {
      setSavingPolicy(false);
      setEditingPolicy(false);
    }
  };

  const startPriceEdit = (pos: PortfolioPosition) => {
    setEditingPriceId(pos.underlyingId);
    setPriceInput(pos.currentPrice !== null ? pos.currentPrice.toString() : "");
  };

  const savePrice = async (underlyingId: string) => {
    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) return;

    setSavingPrice(true);
    const res = await fetch(`/api/accounts/${accountId}/portfolio`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ underlyingId, currentPrice: price }),
    });
    if (res.ok) {
      // Refresh portfolio data
      await fetchPortfolio();
    }
    setSavingPrice(false);
    setEditingPriceId(null);
  };

  const fetchPortfolio = async () => {
    const res = await fetch(`/api/accounts/${accountId}/portfolio`);
    if (res.ok) {
      const data = await res.json();
      setPositions(data.positions ?? []);
      setSummary(data.summary ?? null);
    }
  };

  const refreshPrices = async () => {
    setRefreshingPrices(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/portfolio/refresh-prices`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchPortfolio();
      }
    } finally {
      setRefreshingPrices(false);
    }
  };

  const handleDeletePosition = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/portfolio?underlyingId=${deleteTarget.underlyingId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setDeleteTarget(null);
        await fetchPortfolio();
      }
    } finally {
      setDeleting(false);
    }
  };

  const startOptionEdit = (ot: OptionTradeDetail) => {
    setEditingOptionId(ot.id);
    setOptionExitPrice(ot.exitPrice?.toString() ?? "");
    // Default to now in local datetime format
    const now = new Date();
    const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setOptionExitDate(
      ot.exitDateTime
        ? new Date(new Date(ot.exitDateTime).getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : localDatetime
    );
    setOptionError(null);
  };

  const cancelOptionEdit = () => {
    setEditingOptionId(null);
    setOptionExitPrice("");
    setOptionExitDate("");
    setOptionError(null);
  };

  const saveOptionClose = async (journalTradeId: string) => {
    const exitPrice = parseFloat(optionExitPrice);
    if (isNaN(exitPrice) || exitPrice < 0) {
      setOptionError("Enter a valid exit price (0 for expired worthless).");
      return;
    }
    if (!optionExitDate) {
      setOptionError("Exit date is required.");
      return;
    }

    setSavingOption(true);
    setOptionError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/journal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId: journalTradeId,
          exitPrice,
          exitDateTime: new Date(optionExitDate).toISOString(),
        }),
      });
      if (res.ok) {
        cancelOptionEdit();
        // Refresh portfolio to show updated data
        await fetchPortfolio();
      } else {
        const errBody = await res.json().catch(() => null);
        setOptionError(errBody?.error ?? `Save failed (${res.status})`);
      }
    } catch {
      setOptionError("Network error — check your connection.");
    } finally {
      setSavingOption(false);
    }
  };

  const savePremiumPolicy = async (underlyingId: string, policy: PremiumPolicy | null) => {
    setSavingStrategy(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/portfolio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ underlyingId, premiumPolicy: policy }),
      });
      if (res.ok) {
        // Update local state immediately
        setPositions((prev) =>
          prev.map((p) => (p.underlyingId === underlyingId ? { ...p, premiumPolicy: policy } : p))
        );
      }
    } finally {
      setSavingStrategy(false);
      setEditingStrategyId(null);
    }
  };

  const completeOnboarding = async () => {
    setCompletingOnboarding(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingCompletedAt: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAccount((prev) =>
          prev ? { ...prev, onboardingCompletedAt: updated.onboardingCompletedAt } : prev
        );
        setShowOnboardingConfirm(false);
      }
    } finally {
      setCompletingOnboarding(false);
    }
  };

  const submitDeposit = async () => {
    const amount = parseFloat(depositForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setDepositError("Enter a valid positive amount.");
      return;
    }
    if (!depositForm.occurredAt) {
      setDepositError("Date is required.");
      return;
    }

    setSavingDeposit(true);
    setDepositError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          occurredAt: new Date(depositForm.occurredAt).toISOString(),
          notes: depositForm.notes || undefined,
        }),
      });
      if (res.ok) {
        setShowDeposit(false);
        setDepositForm({ amount: "", occurredAt: new Date().toISOString().slice(0, 16), notes: "" });
        // Refresh account data to show updated cash balance
        const accountRes = await fetch(`/api/accounts/${accountId}`);
        if (accountRes.ok) {
          const accountData = await accountRes.json();
          setAccount(accountData);
        }
      } else {
        const errBody = await res.json().catch(() => null);
        setDepositError(errBody?.error ?? "Failed to record deposit.");
      }
    } catch {
      setDepositError("Network error — check your connection.");
    } finally {
      setSavingDeposit(false);
    }
  };

  const archiveAccount = async () => {
    setArchivingAccount(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/accounts");
      }
    } finally {
      setArchivingAccount(false);
    }
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/accounts/${accountId}`).then((r) => r.json()),
      fetch(`/api/accounts/${accountId}/portfolio`).then((r) => r.json()),
    ]).then(([accountData, portfolioData]) => {
      if (!accountData.error) {
        setAccount(accountData);
      }
      setPositions(portfolioData.positions ?? []);
      setSummary(portfolioData.summary ?? null);
      setLoading(false);
    });
  }, [accountId]);

  if (loading) {
    return <div className="animate-pulse h-96 bg-card rounded-xl" />;
  }

  if (!account) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted">Account not found.</p>
        <Link href="/accounts" className="text-accent hover:underline mt-2 inline-block">
          Back to Accounts
        </Link>
      </div>
    );
  }

  const totalAccountValue =
    (summary?.totalCostBasis ?? 0) +
    parseFloat(account.cashBalance) +
    parseFloat(account.cashflowReserve);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{account.name}</h1>
            <Badge variant={account.mode === "SIMULATED" ? "warning" : "success"}>
              {account.mode === "SIMULATED" ? "Simulated" : "Live"}
            </Badge>
          </div>
          <div className="text-muted text-sm mt-1 flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span>Account Strategy:</span>
              {editingPolicy ? (
                <div className="inline-flex items-center gap-1">
                  <select
                    className="text-xs px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
                    defaultValue={account.defaultPolicy ?? ""}
                    autoFocus
                    disabled={savingPolicy}
                    onChange={(e) => {
                      const val = e.target.value;
                      savePolicy(val === "" ? null : (val as PremiumPolicy));
                    }}
                  >
                    <option value="">None (set per stock)</option>
                    <option value="CASHFLOW">Cashflow (Income)</option>
                    <option value="BASIS_REDUCTION">Basis Reduction</option>
                    <option value="REINVEST_ON_CLOSE">Reinvest on Close</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setEditingPolicy(false)}
                    className="text-muted hover:text-foreground"
                    title="Cancel"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingPolicy(true); setPolicyError(null); }}
                  className="inline-flex items-center gap-0.5 group hover:text-foreground transition-colors"
                  title="Change account strategy"
                >
                  <span>{account.defaultPolicy ? account.defaultPolicy.replace(/_/g, " ") : "None"}</span>
                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              <span>&middot; {account.underlyings.length} underlyings</span>
            </div>
            {policyError && (
              <p className="text-danger text-xs">{policyError}</p>
            )}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchiveConfirm(true)}
            className="text-muted hover:text-danger"
            title="Archive account"
          >
            <Archive className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Onboarding Banner */}
      {!account.onboardingCompletedAt && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Setup Mode</p>
            <p className="text-sm text-muted mt-1">
              Add your existing positions, historical trades, and set your starting cash balance.
              When you&apos;re ready, complete onboarding to start automatic cash tracking.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => setShowOnboardingConfirm(true)}
            >
              Complete Onboarding
            </Button>
          </div>
        </div>
      )}

      {/* Onboarding Confirmation Dialog */}
      <ConfirmDialog
        open={showOnboardingConfirm}
        title="Complete Onboarding?"
        confirmLabel="Go Live"
        loading={completingOnboarding}
        onConfirm={completeOnboarding}
        onCancel={() => setShowOnboardingConfirm(false)}
      >
        <div className="space-y-3 text-sm">
          <p>
            After completing onboarding, all new trades will <span className="font-medium text-foreground">automatically update your cash balance</span>:
          </p>
          <ul className="list-disc ml-5 space-y-1 text-muted">
            <li>Option premiums received will increase your free cash</li>
            <li>Stock purchases will deduct from your free cash</li>
            <li>Stock sales will add to your free cash</li>
          </ul>
          <p>
            Your current free cash of{" "}
            <span className="font-semibold text-foreground">
              ${parseFloat(account.cashBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>{" "}
            will be your starting point. You can always edit it manually if needed.
          </p>
        </div>
      </ConfirmDialog>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { href: `/accounts/${accountId}/statement`, icon: FileText, label: "Statement", color: "text-foreground" },
          { href: `/accounts/${accountId}/wheel`, icon: PieChart, label: "Wealth Wheel", color: "text-core" },
          { href: `/accounts/${accountId}/journal`, icon: BookOpen, label: "Journal", color: "text-accent" },
          { href: `/accounts/${accountId}/research`, icon: Microscope, label: "Research", color: "text-warning" },
          { href: `/accounts/${accountId}/reinvest`, icon: RefreshCcw, label: "Reinvest", color: "text-success" },
          { href: `/import`, icon: Upload, label: "CSV Import", color: "text-muted" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:border-accent/30 transition-all text-center py-4">
              <item.icon className={`w-5 h-5 ${item.color} mx-auto mb-2`} />
              <p className="text-xs font-medium">{item.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Account Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-2xl font-bold">
            ${totalAccountValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted">Total Account Value</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold">
            ${(summary?.totalCostBasis ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted">Invested (Cost Basis)</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold">{positions.length}</p>
          <p className="text-xs text-muted">Stock Positions</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold">{account._count.journalTrades}</p>
          <p className="text-xs text-muted">Journal Entries</p>
        </Card>
      </div>

      {/* Cash Balances */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-success" />
            <h2 className="text-lg font-semibold">Cash Balances</h2>
          </div>
          <div className="flex items-center gap-1">
            {account.onboardingCompletedAt && !editingCash && (
              <button
                onClick={() => {
                  setDepositError(null);
                  setDepositForm({ amount: "", occurredAt: new Date().toISOString().slice(0, 16), notes: "" });
                  setShowDeposit(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-success hover:bg-card-hover transition-colors"
                aria-label="Add deposit"
              >
                <Banknote className="w-4 h-4" />
                Deposit
              </button>
            )}
          {!editingCash ? (
            <button
              onClick={openCashEdit}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
              aria-label="Edit cash balances"
            >
              <Pencil className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={saveCash}
                disabled={savingCash}
                className="p-1.5 rounded-lg text-success hover:bg-card-hover transition-colors"
                aria-label="Save"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={cancelCashEdit}
                className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          </div>
        </div>
        {editingCash ? (
          <div>
            <div
              className="grid grid-cols-2 gap-4"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !savingCash) saveCash();
                if (e.key === "Escape") cancelCashEdit();
              }}
            >
              <Input
                label="Free Cash"
                type="number"
                min="0"
                step="0.01"
                value={cashForm.cashBalance}
                onChange={(e) => setCashForm((f) => ({ ...f, cashBalance: e.target.value }))}
                hint="Total uninvested cash in the account"
              />
              <Input
                label="Cashflow Reserve"
                type="number"
                min="0"
                step="0.01"
                value={cashForm.cashflowReserve}
                onChange={(e) => setCashForm((f) => ({ ...f, cashflowReserve: e.target.value }))}
                hint="Cash set aside for income / cashflow"
              />
            </div>
            {cashError ? (
              <p className="text-danger text-sm mt-2">{cashError}</p>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-success">
                ${parseFloat(account.cashBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted mt-1">Free Cash</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                ${parseFloat(account.cashflowReserve).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted mt-1">Cashflow Reserve</p>
            </div>
          </div>
        )}
      </Card>

      {/* Deposit Form */}
      {showDeposit && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-success" />
              <h3 className="font-semibold">Record Cash Deposit</h3>
            </div>
            <button
              onClick={() => setShowDeposit(false)}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {depositError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm mb-4">
              {depositError}
            </div>
          )}
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !savingDeposit) submitDeposit();
              if (e.key === "Escape") setShowDeposit(false);
            }}
          >
            <Input
              label="Amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="e.g. 5000.00"
              value={depositForm.amount}
              onChange={(e) => setDepositForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
            <Input
              label="Date"
              type="datetime-local"
              value={depositForm.occurredAt}
              onChange={(e) => setDepositForm((f) => ({ ...f, occurredAt: e.target.value }))}
              required
            />
            <Input
              label="Notes (optional)"
              placeholder="e.g. Monthly contribution"
              value={depositForm.notes}
              onChange={(e) => setDepositForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={submitDeposit} loading={savingDeposit} size="sm">
              Record Deposit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDeposit(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Portfolio Snapshot */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold">Portfolio Snapshot</h2>
          </div>
          {positions.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={refreshPrices}
              disabled={refreshingPrices}
            >
              <RefreshCcw className={`w-4 h-4 ${refreshingPrices ? "animate-spin" : ""}`} />
              {refreshingPrices ? "Refreshing…" : "Refresh prices"}
            </Button>
          )}
        </div>

        {positions.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-muted">
              No stock positions yet. Use + Stock above to add your first holding.
            </p>
          </Card>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card-hover">
                  <th className="text-left p-3 font-medium text-muted w-8" />
                  <th className="text-left p-3 font-medium text-muted">Symbol</th>
                  <th className="text-right p-3 font-medium text-muted">Shares</th>
                  <th className="text-right p-3 font-medium text-muted">Cost Basis</th>
                  <th className="text-right p-3 font-medium text-muted">Current Price</th>
                  <th className="text-right p-3 font-medium text-muted">Market Value</th>
                  <th className="text-right p-3 font-medium text-muted">P&L</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => {
                  // Compute total net premium from all option trades (open + closed)
                  const totalOptionPremium = (pos.optionTrades ?? []).reduce(
                    (sum, ot) => sum + (ot.nrop ?? ot.netPremium),
                    0
                  );
                  const hasPremiumReduction = pos.totalPremiumReduction > 0;
                  const hasOptionTrades = (pos.optionTrades?.length ?? 0) > 0;
                  const hasOptionPremium = totalOptionPremium !== 0;
                  // Combined P/L = pure stock P/L + total option premium
                  const combinedPnl = pos.originalPnl !== null
                    ? pos.originalPnl + totalOptionPremium
                    : null;
                  const isExpanded = expandedPositionId === pos.underlyingId;

                  const policyLabel: Record<string, string> = {
                    CASHFLOW: "Income",
                    BASIS_REDUCTION: "Reduce Basis",
                    REINVEST_ON_CLOSE: "Buy Shares",
                  };

                  const policyBadgeVariant: Record<string, "default" | "success" | "warning" | "core" | "danger"> = {
                    CASHFLOW: "default",
                    BASIS_REDUCTION: "success",
                    REINVEST_ON_CLOSE: "core",
                  };

                  const fmtNum = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                  return (
                    <React.Fragment key={pos.underlyingId}>
                    <tr
                      className={`border-b border-border/50 hover:bg-card-hover ${hasOptionTrades || hasPremiumReduction ? "cursor-pointer" : ""}`}
                      onClick={() => {
                        if (hasOptionTrades || hasPremiumReduction) {
                          setExpandedPositionId(isExpanded ? null : pos.underlyingId);
                        }
                      }}
                    >
                      {/* Expand arrow */}
                      <td className="p-3 text-muted">
                        {(hasOptionTrades || hasPremiumReduction) ? (
                          isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )
                        ) : null}
                      </td>

                      {/* Symbol + Strategy */}
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <span className="font-semibold">{pos.symbol}</span>
                          <span className="text-xs text-muted ml-2">
                            {pos.lotCount} lot{pos.lotCount !== 1 ? "s" : ""}
                          </span>
                          {hasOptionTrades && (
                            <Badge variant="warning" className="ml-2">
                              {pos.optionTrades!.length} option{pos.optionTrades!.length !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        {/* Premium strategy selector */}
                        <div className="mt-1">
                          {editingStrategyId === pos.underlyingId ? (
                            <div className="flex items-center gap-1">
                              <select
                                className="text-xs px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
                                defaultValue={pos.premiumPolicy ?? ""}
                                autoFocus
                                onChange={(e) => {
                                  const val = e.target.value;
                                  savePremiumPolicy(
                                    pos.underlyingId,
                                    val === "" ? null : (val as PremiumPolicy)
                                  );
                                }}
                                onBlur={() => setEditingStrategyId(null)}
                              >
                                <option value="">Use account default</option>
                                <option value="CASHFLOW">Income (pay yourself)</option>
                                <option value="BASIS_REDUCTION">Reduce cost basis</option>
                                <option value="REINVEST_ON_CLOSE">Buy more shares</option>
                              </select>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingStrategyId(pos.underlyingId)}
                              className="inline-flex items-center gap-0.5 group"
                              title="Set premium strategy for this stock"
                              disabled={savingStrategy}
                            >
                              {pos.premiumPolicy ? (
                                <Badge variant={policyBadgeVariant[pos.premiumPolicy]}>
                                  {policyLabel[pos.premiumPolicy]}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted italic">Set strategy</span>
                              )}
                              <ChevronDown className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Shares */}
                      <td className="p-3 text-right font-medium">
                        {pos.shares.toLocaleString()}
                      </td>

                      {/* Cost Basis — per-share, adjusted for premium reductions */}
                      <td className="p-3 text-right">
                        <div className="font-medium">${pos.adjustedCostPerShare.toFixed(2)}</div>
                        <div className="text-[10px] text-muted">/share</div>
                      </td>

                      {/* Current Price */}
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {editingPriceId === pos.underlyingId ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={priceInput}
                              onChange={(e) => setPriceInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") savePrice(pos.underlyingId);
                                if (e.key === "Escape") setEditingPriceId(null);
                              }}
                              className="w-20 px-2 py-1 text-right text-sm bg-background border border-border rounded"
                              autoFocus
                            />
                            <button
                              onClick={() => savePrice(pos.underlyingId)}
                              disabled={savingPrice}
                              className="p-1 text-success hover:bg-card-hover rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingPriceId(null)}
                              className="p-1 text-muted hover:text-foreground hover:bg-card-hover rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startPriceEdit(pos)}
                            className="text-right hover:text-accent transition-colors group"
                            title="Click to update price"
                          >
                            {pos.currentPrice !== null ? (
                              <span>${pos.currentPrice.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted italic">Set price</span>
                            )}
                            <Pencil className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>

                      {/* Market Value */}
                      <td className="p-3 text-right">
                        {pos.marketValue !== null ? (
                          <span>${pos.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>

                      {/* P&L — stock-only (combined with options shown in expanded view) */}
                      <td className="p-3 text-right">
                        {pos.originalPnl !== null ? (
                          <div>
                            <span
                              className={`flex items-center justify-end gap-1 font-medium ${
                                pos.originalPnl >= 0 ? "text-success" : "text-danger"
                              }`}
                            >
                              {pos.originalPnl >= 0 ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : (
                                <TrendingDown className="w-3.5 h-3.5" />
                              )}
                              ${Math.abs(pos.originalPnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            {pos.originalPnlPct !== null && (
                              <span className={`text-xs ${pos.originalPnl >= 0 ? "text-success" : "text-danger"}`}>
                                {pos.originalPnlPct >= 0 ? "+" : ""}
                                {pos.originalPnlPct.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>

                      {/* Delete */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setDeleteTarget(pos)}
                          className="p-1 text-muted hover:text-danger transition-colors rounded hover:bg-card-hover"
                          title={`Remove ${pos.symbol}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>

                    {/* Expanded option trades & cost basis detail */}
                    {isExpanded && (
                      <tr className="bg-background/50">
                        <td colSpan={8} className="p-0">
                          <div className="px-6 py-4 space-y-4">
                            {/* Cost basis breakdown */}
                            {hasPremiumReduction && (
                              <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                                  Cost Basis Breakdown
                                </p>
                                <div className="grid grid-cols-4 gap-4 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted">Original Basis</span>
                                    <span>${fmtNum(pos.originalCostBasis)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted">Premium Reduction</span>
                                    <span className="text-success">-${fmtNum(pos.totalPremiumReduction)}</span>
                                  </div>
                                  <div className="flex justify-between font-semibold">
                                    <span className="text-muted">Adjusted Basis</span>
                                    <span>${fmtNum(pos.totalCostBasis)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted">Adj. Cost/Share</span>
                                    <span>${pos.adjustedCostPerShare.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Option trade line items */}
                            {hasOptionTrades && (
                              <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                                  Option Trades
                                </p>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border/30">
                                      <th className="text-left py-1.5 px-2 font-medium text-muted">Type</th>
                                      <th className="text-right py-1.5 px-2 font-medium text-muted">Strike</th>
                                      <th className="text-right py-1.5 px-2 font-medium text-muted">Contracts</th>
                                      <th className="text-right py-1.5 px-2 font-medium text-muted">Entry</th>
                                      <th className="text-right py-1.5 px-2 font-medium text-muted">Premium Received</th>
                                      <th className="text-right py-1.5 px-2 font-medium text-muted">Premium Paid</th>
                                      <th className="text-right py-1.5 px-2 font-medium text-muted">Net P/L</th>
                                      <th className="text-left py-1.5 px-2 font-medium text-muted">Status</th>
                                      <th className="py-1.5 px-2 w-24" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pos.optionTrades!.map((ot) => {
                                      const isEditingThis = editingOptionId === ot.id;
                                      return (
                                        <React.Fragment key={ot.id}>
                                        <tr className="border-b border-border/20">
                                          <td className="py-1.5 px-2">
                                            <Badge variant={ot.callPut === "CALL" ? "warning" : "core"}>
                                              {ot.callPut}
                                            </Badge>
                                          </td>
                                          <td className="py-1.5 px-2 text-right font-mono">
                                            {ot.strike !== null ? `$${fmtNum(ot.strike)}` : "—"}
                                          </td>
                                          <td className="py-1.5 px-2 text-right">{ot.quantity}</td>
                                          <td className="py-1.5 px-2 text-right">
                                            {ot.entryPrice !== null ? `$${fmtNum(ot.entryPrice)}` : "—"}
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-success">
                                            {ot.premiumReceived > 0 ? `$${fmtNum(ot.premiumReceived)}` : "$0.00"}
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-danger">
                                            {ot.premiumPaid > 0 ? `$${fmtNum(ot.premiumPaid)}` : "$0.00"}
                                          </td>
                                          <td className={`py-1.5 px-2 text-right font-semibold ${
                                            (ot.nrop ?? ot.netPremium) > 0 ? "text-success" :
                                            (ot.nrop ?? ot.netPremium) < 0 ? "text-danger" : "text-foreground"
                                          }`}>
                                            {(ot.nrop ?? ot.netPremium) >= 0 ? "" : "-"}${fmtNum(Math.abs(ot.nrop ?? ot.netPremium))}
                                          </td>
                                          <td className="py-1.5 px-2">
                                            <Badge variant={ot.status === "FINALIZED" ? "success" : "warning"}>
                                              {ot.status === "FINALIZED" ? "Closed" : "Open"}
                                            </Badge>
                                          </td>
                                          <td className="py-1.5 px-2 text-right">
                                            {ot.status === "OPEN" && ot.journalTradeId && !isEditingThis && (
                                              <button
                                                onClick={() => startOptionEdit(ot)}
                                                className="px-2 py-0.5 text-[10px] font-medium bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors"
                                              >
                                                Close Trade
                                              </button>
                                            )}
                                            {ot.status === "OPEN" && isEditingThis && (
                                              <button
                                                onClick={cancelOptionEdit}
                                                className="px-2 py-0.5 text-[10px] font-medium text-muted hover:text-foreground transition-colors"
                                              >
                                                Cancel
                                              </button>
                                            )}
                                          </td>
                                        </tr>

                                        {/* Inline close trade form */}
                                        {isEditingThis && ot.journalTradeId && (
                                          <tr className="bg-accent/5 border-b border-border/20">
                                            <td colSpan={9} className="py-3 px-4">
                                              <div className="flex items-end gap-4">
                                                <div className="flex-1 max-w-[160px]">
                                                  <label className="block text-[10px] font-medium text-muted mb-1">
                                                    Exit Price (per contract)
                                                  </label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={optionExitPrice}
                                                    onChange={(e) => setOptionExitPrice(e.target.value)}
                                                    placeholder="0.00 = expired"
                                                    className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter") saveOptionClose(ot.journalTradeId!);
                                                      if (e.key === "Escape") cancelOptionEdit();
                                                    }}
                                                  />
                                                </div>
                                                <div className="flex-1 max-w-[200px]">
                                                  <label className="block text-[10px] font-medium text-muted mb-1">
                                                    Exit Date
                                                  </label>
                                                  <input
                                                    type="datetime-local"
                                                    value={optionExitDate}
                                                    onChange={(e) => setOptionExitDate(e.target.value)}
                                                    className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground"
                                                  />
                                                </div>
                                                <button
                                                  onClick={() => saveOptionClose(ot.journalTradeId!)}
                                                  disabled={savingOption}
                                                  className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                                                >
                                                  {savingOption ? "Saving…" : "Confirm Close"}
                                                </button>
                                                <button
                                                  onClick={cancelOptionEdit}
                                                  className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                              {optionError && (
                                                <p className="text-danger text-[10px] mt-1.5">{optionError}</p>
                                              )}
                                            </td>
                                          </tr>
                                        )}
                                        </React.Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Combined P&L summary */}
                            {(hasPremiumReduction || hasOptionPremium) && pos.originalPnl !== null && (
                              <div className="pt-3 border-t border-border/50">
                                <div className="grid grid-cols-3 gap-6 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted">Stock P/L</span>
                                    <span className={pos.originalPnl >= 0 ? "text-success" : "text-danger"}>
                                      {pos.originalPnl >= 0 ? "+" : "-"}${fmtNum(Math.abs(pos.originalPnl))}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted">Option Premium</span>
                                    <span className={totalOptionPremium >= 0 ? "text-success" : "text-danger"}>
                                      {totalOptionPremium >= 0 ? "+" : "-"}${fmtNum(Math.abs(totalOptionPremium))}
                                    </span>
                                  </div>
                                  <div className="flex justify-between font-semibold">
                                    <span className="text-muted">Combined P/L</span>
                                    <span className={combinedPnl !== null && combinedPnl >= 0 ? "text-success" : "text-danger"}>
                                      {combinedPnl !== null
                                        ? `${combinedPnl >= 0 ? "+" : "-"}$${fmtNum(Math.abs(combinedPnl))}`
                                        : "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {/* Summary footer */}
              <tfoot>
                <tr className="bg-card-hover font-medium">
                  <td className="p-3" />
                  <td className="p-3" colSpan={3}>
                    Totals
                  </td>
                  <td className="p-3 text-right" />
                  <td className="p-3 text-right">
                    {summary?.totalMarketValue !== null && summary?.totalMarketValue !== undefined ? (
                      <span>${summary.totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {summary?.totalMarketValue !== null &&
                    summary?.totalMarketValue !== undefined &&
                    summary?.totalOriginalCostBasis > 0 ? (
                      (() => {
                        const totalPnl = summary.totalMarketValue - summary.totalOriginalCostBasis;
                        const isPositive = totalPnl >= 0;
                        return (
                          <span className={`font-medium ${isPositive ? "text-success" : "text-danger"}`}>
                            {isPositive ? "+" : "-"}$
                            {Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="p-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete stock position?"
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDeletePosition}
        onCancel={() => setDeleteTarget(null)}
      >
        <p>
          This will permanently remove{" "}
          <span className="font-medium text-foreground">
            {deleteTarget?.symbol}
          </span>{" "}
          ({deleteTarget?.shares} shares) and all its stock lots from this portfolio.
          This cannot be undone.
        </p>
      </ConfirmDialog>

      {/* Archive account confirmation dialog */}
      <ConfirmDialog
        open={showArchiveConfirm}
        title="Archive this account?"
        confirmLabel="Archive Account"
        loading={archivingAccount}
        onConfirm={archiveAccount}
        onCancel={() => setShowArchiveConfirm(false)}
      >
        <div className="space-y-3">
          <p>
            Are you sure you want to archive{" "}
            <span className="font-medium text-foreground">{account.name}</span>?
            It will no longer appear in your active accounts.
          </p>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-warning">
              We will keep this account and all its data on file for 90 days. After that, it will be permanently deleted.
            </p>
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
