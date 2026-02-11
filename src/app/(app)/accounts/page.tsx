"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PlusCircle, ArrowRight, X } from "lucide-react";

interface Account {
  id: string;
  name: string;
  mode: string;
  defaultPolicy: string;
  notes: string | null;
  _count: {
    strategyInstances: number;
    reinvestSignals: number;
  };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [mode, setMode] = useState("SIMULATED");
  const [policy, setPolicy] = useState("CASHFLOW");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const fetchAccounts = () => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

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
          defaultPolicy: policy,
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
              label="Default Premium Policy"
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
              options={[
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

      {/* Accounts List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-muted">
            No accounts yet. Create your first account to start tracking trades.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((account) => (
            <Link key={account.id} href={`/accounts/${account.id}`}>
              <Card className="hover:border-accent/30 transition-all group h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle>{account.name}</CardTitle>
                    <Badge variant={account.mode === "SIMULATED" ? "warning" : "success"}>
                      {account.mode === "SIMULATED" ? "Simulated" : "Live"}
                    </Badge>
                  </div>
                  <CardDescription>
                    Policy: {account.defaultPolicy.replace(/_/g, " ")}
                  </CardDescription>
                </CardHeader>
                <div className="flex items-center gap-4 text-sm text-muted">
                  <span>{account._count.strategyInstances} instances</span>
                  <span>{account._count.reinvestSignals} signals</span>
                </div>
                <div className="flex items-center text-sm text-accent group-hover:text-accent-hover mt-3">
                  Manage account <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
