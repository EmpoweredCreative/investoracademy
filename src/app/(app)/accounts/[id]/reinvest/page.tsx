"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, RefreshCcw, Check, Clock, X, DollarSign } from "lucide-react";
import Link from "next/link";

interface Signal {
  id: string;
  amount: string;
  status: string;
  dueAt: string;
  completedAmount: string | null;
  notes: string | null;
  underlying: { symbol: string };
  instance: {
    optionAction: string | null;
    callPut: string | null;
    strike: string | null;
  };
}

const STATUS_BADGE: Record<string, { variant: "success" | "warning" | "danger" | "default"; label: string }> = {
  CREATED: { variant: "warning", label: "Pending" },
  NOTIFIED: { variant: "warning", label: "Notified" },
  ACKNOWLEDGED: { variant: "default", label: "Acknowledged" },
  SNOOZED: { variant: "default", label: "Snoozed" },
  COMPLETED: { variant: "success", label: "Completed" },
  PARTIAL_COMPLETED: { variant: "success", label: "Partial" },
  SKIPPED: { variant: "danger", label: "Skipped" },
};

export default function ReinvestPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [signals, setSignals] = useState<Signal[]>([]);
  const [reinvestReady, setReinvestReady] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSignals = () => {
    fetch(`/api/accounts/${accountId}/reinvest`)
      .then((r) => r.json())
      .then((data) => {
        setSignals(data.signals);
        setReinvestReady(data.reinvestReady);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSignals();
  }, [accountId]);

  const handleAction = async (
    signalId: string,
    action: "CONFIRM_FULL" | "CONFIRM_PARTIAL" | "SNOOZE" | "SKIP"
  ) => {
    setActionLoading(signalId);
    await fetch(`/api/accounts/${accountId}/reinvest?signalId=${signalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setActionLoading(null);
    fetchSignals();
  };

  if (loading) {
    return <div className="animate-pulse h-96 bg-card rounded-xl" />;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href={`/accounts/${accountId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Reinvest Signals</h1>
          <p className="text-muted text-sm">Manage your reinvestment alerts</p>
        </div>
      </div>

      {/* Ready Banner */}
      <Card className="!bg-accent/5 !border-accent/20">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-accent/10">
            <DollarSign className="w-8 h-8 text-accent" />
          </div>
          <div>
            <p className="text-sm text-muted">Reinvest Ready</p>
            <p className="text-3xl font-bold">${parseFloat(reinvestReady).toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* Signals */}
      {signals.length === 0 ? (
        <Card className="text-center py-12">
          <RefreshCcw className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted">No pending reinvest signals.</p>
          <p className="text-sm text-muted mt-1">
            Signals are created when options with REINVEST_ON_CLOSE policy are finalized with profit.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {signals.map((signal) => {
            const isDue = new Date(signal.dueAt) <= new Date();
            const status = STATUS_BADGE[signal.status] || STATUS_BADGE.CREATED;
            const isPending = ["CREATED", "NOTIFIED", "SNOOZED"].includes(signal.status);

            return (
              <Card key={signal.id} className="!p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{signal.underlying.symbol}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {isDue && isPending && (
                        <Badge variant="warning">Due</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted">
                      {signal.instance.optionAction} {signal.instance.strike && `$${parseFloat(signal.instance.strike).toFixed(2)}`}{" "}
                      {signal.instance.callPut}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted">
                      <span>Amount: ${parseFloat(signal.amount).toFixed(2)}</span>
                      <span>Due: {new Date(signal.dueAt).toLocaleDateString()}</span>
                      {signal.completedAmount && (
                        <span className="text-success">
                          Completed: ${parseFloat(signal.completedAmount).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {isPending && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleAction(signal.id, "CONFIRM_FULL")}
                        loading={actionLoading === signal.id}
                      >
                        <Check className="w-3.5 h-3.5" />
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAction(signal.id, "SNOOZE")}
                      >
                        <Clock className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAction(signal.id, "SKIP")}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
