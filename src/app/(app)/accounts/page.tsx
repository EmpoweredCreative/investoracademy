"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PlusCircle, ArrowRight, X, Archive, AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const TOOL_LABELS: Record<string, string> = {
  wheel: "Wealth Wheel",
  journal: "Journal",
  research: "Research",
  reinvest: "Reinvest",
};

interface Account {
  id: string;
  name: string;
  mode: string;
  defaultPolicy: string | null;
  notes: string | null;
  archivedAt: string | null;
  _count: {
    strategyInstances: number;
    reinvestSignals: number;
  };
}

export default function AccountsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tool = searchParams.get("tool");
  const toolLabel = tool && TOOL_LABELS[tool] ? TOOL_LABELS[tool] : null;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [archivedAccounts, setArchivedAccounts] = useState<Account[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Archive state
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [mode, setMode] = useState("SIMULATED");
  const [policy, setPolicy] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const fetchAccounts = () => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        setAccounts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchArchivedAccounts = () => {
    fetch("/api/accounts?archived=true")
      .then((r) => r.json())
      .then((data) => setArchivedAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (showArchived) fetchArchivedAccounts();
  }, [showArchived]);

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/accounts/${archiveTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setArchiveTarget(null);
        fetchAccounts();
        if (showArchived) fetchArchivedAccounts();
      }
    } catch {
      // silently fail
    } finally {
      setArchiving(false);
    }
  };

  // When a tool is selected and we have exactly one account, go straight to that account's tool
  useEffect(() => {
    if (loading || !toolLabel || !tool) return;
    if (accounts.length === 1) {
      router.replace(`/accounts/${accounts[0].id}/${tool}`);
    }
  }, [loading, accounts, tool, toolLabel, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mode,
          defaultPolicy: policy || null,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create account");
        setCreating(false);
        return;
      }

      setShowCreate(false);
      setName("");
      setNotes("");
      setCreating(false);
      fetchAccounts();
    } catch {
      setError("Something went wrong");
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-muted text-sm mt-1">Manage your trading accounts</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <PlusCircle className="w-4 h-4" />
          New Account
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Create Account</h3>
            <button onClick={() => setShowCreate(false)} className="text-muted hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Account Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Paper Trading"
                required
              />
              <Select
                label="Account Mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                options={[
                  { value: "SIMULATED", label: "Simulated" },
                  { value: "LIVE_SCHWAB", label: "Live (Schwab)" },
                ]}
              />
            </div>
            <Select
              label="Account Strategy"
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
              options={[
                { value: "", label: "None (set per stock)" },
                { value: "CASHFLOW", label: "Cashflow" },
                { value: "BASIS_REDUCTION", label: "Basis Reduction" },
                { value: "REINVEST_ON_CLOSE", label: "Reinvest on Close" },
              ]}
            />
            <Input
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Account description or notes"
            />
            <div className="flex gap-3">
              <Button type="submit" loading={creating}>
                Create Account
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Account tool picker: which account to open this tool for? */}
      {!loading && toolLabel && accounts.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Which account?</CardTitle>
            <CardDescription>
              Open {toolLabel} for one of your accounts.
            </CardDescription>
          </CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((account) => (
              <Link key={account.id} href={`/accounts/${account.id}/${tool}`}>
                <Card className="hover:border-accent/30 transition-all group h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle>{account.name}</CardTitle>
                      <Badge variant={account.mode === "SIMULATED" ? "warning" : "success"}>
                        {account.mode === "SIMULATED" ? "Simulated" : "Live"}
                      </Badge>
                    </div>
                    <CardDescription>
                      Strategy: {account.defaultPolicy ? account.defaultPolicy.split("_").join(" ") : "None"}
                    </CardDescription>
                  </CardHeader>
                  <div className="flex items-center text-sm text-accent group-hover:text-accent-hover">
                    Open {toolLabel} <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <Link
              href="/accounts"
              className="text-sm text-muted hover:text-foreground"
            >
              ← Back to all accounts
            </Link>
          </div>
        </Card>
      ) : null}

      {/* Accounts List (or empty state) when not showing tool picker */}
      {!loading && (!toolLabel || accounts.length <= 1) && (
        <>
          {accounts.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-muted">
                {toolLabel
                  ? `No accounts yet. Create an account to use ${toolLabel}.`
                  : "No accounts yet. Create your first account to start tracking trades."}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((account) => (
                <Card key={account.id} className="hover:border-accent/30 transition-all group h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <Link href={`/accounts/${account.id}`}>
                        <CardTitle className="hover:text-accent transition-colors">{account.name}</CardTitle>
                      </Link>
                      <div className="flex items-center gap-2">
                        <Badge variant={account.mode === "SIMULATED" ? "warning" : "success"}>
                          {account.mode === "SIMULATED" ? "Simulated" : "Live"}
                        </Badge>
                        <button
                          onClick={() => setArchiveTarget(account)}
                          className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-card-hover transition-colors opacity-0 group-hover:opacity-100"
                          title="Archive account"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <CardDescription>
                      Strategy: {account.defaultPolicy ? account.defaultPolicy.split("_").join(" ") : "None"}
                    </CardDescription>
                  </CardHeader>
                  <div className="flex items-center gap-4 text-sm text-muted">
                    <span>{account._count.strategyInstances} instances</span>
                    <span>{account._count.reinvestSignals} signals</span>
                  </div>
                  <Link href={`/accounts/${account.id}`}>
                    <div className="flex items-center text-sm text-accent group-hover:text-accent-hover mt-3">
                      Manage account <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Archive Confirmation Dialog */}
      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive this account?"
        confirmLabel="Archive Account"
        loading={archiving}
        onConfirm={handleArchive}
        onCancel={() => setArchiveTarget(null)}
      >
        <div className="space-y-3">
          <p>
            Are you sure you want to archive{" "}
            <span className="font-medium text-foreground">
              {archiveTarget?.name}
            </span>
            ? It will no longer appear in your active accounts.
          </p>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-warning">
              We will keep this account and all its data on file for 90 days. After that, it will be permanently deleted.
            </p>
          </div>
        </div>
      </ConfirmDialog>

      {/* Archived Accounts Toggle */}
      {!loading && (
        <div className="border-t border-border pt-6">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-sm text-muted hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <Archive className="w-4 h-4" />
            {showArchived ? "Hide" : "View"} archived accounts
          </button>

          {showArchived && (
            <div className="mt-4 space-y-4">
              {archivedAccounts.length === 0 ? (
                <Card className="text-center py-8">
                  <p className="text-muted text-sm">No archived accounts.</p>
                </Card>
              ) : (
                <>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                    <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <p className="text-xs text-warning">
                      Archived accounts are kept on file for 90 days from the date they were archived.
                      After 90 days, they will be permanently deleted along with all associated data.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {archivedAccounts.map((account) => {
                      const archivedDate = account.archivedAt ? new Date(account.archivedAt) : null;
                      const expiresDate = archivedDate
                        ? new Date(archivedDate.getTime() + 90 * 24 * 60 * 60 * 1000)
                        : null;
                      const daysRemaining = expiresDate
                        ? Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
                        : null;

                      return (
                        <Card key={account.id} className="opacity-60 h-full">
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <CardTitle>{account.name}</CardTitle>
                              <Badge variant="default">Archived</Badge>
                            </div>
                            <CardDescription>
                              Strategy: {account.defaultPolicy ? account.defaultPolicy.split("_").join(" ") : "None"}
                            </CardDescription>
                          </CardHeader>
                          <div className="flex items-center gap-4 text-sm text-muted">
                            <span>{account._count.strategyInstances} instances</span>
                            <span>{account._count.reinvestSignals} signals</span>
                          </div>
                          {daysRemaining !== null && (
                            <p className="text-xs text-warning mt-2">
                              {daysRemaining > 0
                                ? `Permanently deleted in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`
                                : "Scheduled for permanent deletion"}
                            </p>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
