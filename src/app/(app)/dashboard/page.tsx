"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Briefcase,
  TrendingUp,
  RefreshCcw,
  AlertCircle,
  PlusCircle,
  ArrowRight,
  PieChart,
} from "lucide-react";

interface Account {
  id: string;
  name: string;
  mode: string;
  _count: {
    strategyInstances: number;
    reinvestSignals: number;
  };
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        setAccounts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-card rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-card rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const totalInstances = accounts.reduce((s, a) => s + a._count.strategyInstances, 0);
  const totalSignals = accounts.reduce((s, a) => s + a._count.reinvestSignals, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted text-sm mt-1">
            Overview of your trading accounts and activity
          </p>
        </div>
        <Link href="/accounts">
          <Button>
            <PlusCircle className="w-4 h-4" />
            New Account
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-accent/10">
              <Briefcase className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">{accounts.length}</p>
              <p className="text-xs text-muted">Accounts</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-success/10">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalInstances}</p>
              <p className="text-xs text-muted">Strategy Instances</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-warning/10">
              <RefreshCcw className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalSignals}</p>
              <p className="text-xs text-muted">Reinvest Signals</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-core/10">
              <PieChart className="w-5 h-5 text-core" />
            </div>
            <div>
              <p className="text-2xl font-bold">{accounts.length}</p>
              <p className="text-xs text-muted">Wealth Wheels</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Accounts List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Your Accounts</h2>
        {accounts.length === 0 ? (
          <Card className="text-center py-12">
            <AlertCircle className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-muted">No accounts yet. Create your first account to get started.</p>
            <Link href="/accounts" className="inline-block mt-4">
              <Button size="sm">
                <PlusCircle className="w-4 h-4" />
                Create Account
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((account) => (
              <Link key={account.id} href={`/accounts/${account.id}`}>
                <Card className="hover:border-accent/30 transition-all group">
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                      <CardTitle>{account.name}</CardTitle>
                      <CardDescription>
                        {account._count.strategyInstances} instances &middot;{" "}
                        {account._count.reinvestSignals} signals
                      </CardDescription>
                    </div>
                    <Badge variant={account.mode === "SIMULATED" ? "warning" : "success"}>
                      {account.mode === "SIMULATED" ? "Simulated" : "Live"}
                    </Badge>
                  </CardHeader>
                  <div className="flex items-center text-sm text-accent group-hover:text-accent-hover">
                    View account <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
