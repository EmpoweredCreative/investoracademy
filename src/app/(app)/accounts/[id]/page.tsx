"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  TrendingUp,
  TrendingDown,
  PlusCircle,
  PieChart,
  BookOpen,
  Microscope,
  RefreshCcw,
  Upload,
  ArrowRight,
} from "lucide-react";

interface AccountDetail {
  id: string;
  name: string;
  mode: string;
  defaultPolicy: string;
  underlyings: Array<{ id: string; symbol: string }>;
  _count: {
    strategyInstances: number;
    ledgerEntries: number;
    reinvestSignals: number;
    journalTrades: number;
    researchIdeas: number;
  };
}

interface Instance {
  id: string;
  instrumentType: string;
  status: string;
  optionAction: string | null;
  callPut: string | null;
  longShort: string | null;
  strike: string | null;
  expiration: string | null;
  quantity: string;
  realizedOptionProfit: string | null;
  finalizationReason: string | null;
  underlying: { symbol: string };
  createdAt: string;
}

export default function AccountDetailPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "finalized">("open");

  useEffect(() => {
    Promise.all([
      fetch(`/api/accounts/${accountId}`).then((r) => r.json()),
      fetch(`/api/accounts/${accountId}/instances`).then((r) => r.json()),
    ]).then(([accountData, instanceData]) => {
      setAccount(accountData);
      setInstances(instanceData);
      setLoading(false);
    });
  }, [accountId]);

  if (loading || !account) {
    return <div className="animate-pulse h-96 bg-card rounded-xl" />;
  }

  const openInstances = instances.filter((i) => i.status === "OPEN");
  const finalizedInstances = instances.filter((i) => i.status === "FINALIZED");
  const displayInstances = tab === "open" ? openInstances : finalizedInstances;

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
          <p className="text-muted text-sm mt-1">
            Policy: {account.defaultPolicy.replace(/_/g, " ")} &middot;{" "}
            {account.underlyings.length} underlyings
          </p>
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

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-2xl font-bold">{openInstances.length}</p>
          <p className="text-xs text-muted">Open Positions</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold">{finalizedInstances.length}</p>
          <p className="text-xs text-muted">Finalized</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold">{account._count.ledgerEntries}</p>
          <p className="text-xs text-muted">Ledger Entries</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold">{account._count.reinvestSignals}</p>
          <p className="text-xs text-muted">Reinvest Signals</p>
        </Card>
      </div>

      {/* Instances */}
      <div>
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold">Strategy Instances</h2>
          <div className="flex gap-1 bg-card rounded-lg p-1">
            <button
              onClick={() => setTab("open")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === "open" ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              Open ({openInstances.length})
            </button>
            <button
              onClick={() => setTab("finalized")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === "finalized" ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              Finalized ({finalizedInstances.length})
            </button>
          </div>
        </div>

        {displayInstances.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-muted">No {tab} instances yet.</p>
          </Card>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card-hover">
                  <th className="text-left p-3 font-medium text-muted">Symbol</th>
                  <th className="text-left p-3 font-medium text-muted">Type</th>
                  <th className="text-left p-3 font-medium text-muted">Action</th>
                  <th className="text-left p-3 font-medium text-muted">Strike</th>
                  <th className="text-left p-3 font-medium text-muted">Qty</th>
                  {tab === "finalized" && (
                    <>
                      <th className="text-left p-3 font-medium text-muted">P&L</th>
                      <th className="text-left p-3 font-medium text-muted">Reason</th>
                    </>
                  )}
                  <th className="text-left p-3 font-medium text-muted">Date</th>
                </tr>
              </thead>
              <tbody>
                {displayInstances.map((inst) => {
                  const pnl = inst.realizedOptionProfit ? parseFloat(inst.realizedOptionProfit) : null;
                  return (
                    <tr key={inst.id} className="border-b border-border/50 hover:bg-card-hover">
                      <td className="p-3 font-medium">{inst.underlying.symbol}</td>
                      <td className="p-3">
                        <Badge variant={inst.instrumentType === "OPTION" ? "core" : "default"}>
                          {inst.instrumentType}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {inst.optionAction || "-"} {inst.callPut || ""}
                      </td>
                      <td className="p-3">{inst.strike ? `$${parseFloat(inst.strike).toFixed(2)}` : "-"}</td>
                      <td className="p-3">{parseFloat(inst.quantity)}</td>
                      {tab === "finalized" && (
                        <>
                          <td className="p-3">
                            {pnl !== null && (
                              <span className={`flex items-center gap-1 font-medium ${pnl >= 0 ? "text-success" : "text-danger"}`}>
                                {pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                ${Math.abs(pnl).toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-muted">{inst.finalizationReason || "-"}</td>
                        </>
                      )}
                      <td className="p-3 text-muted">
                        {new Date(inst.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
