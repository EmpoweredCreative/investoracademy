"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, wheelCategoryBadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface WheelSlice {
  category: string;
  currentValue: string;
  targetPct: string;
  actualPct: string;
  delta: string;
}

interface WheelData {
  slices: WheelSlice[];
  totalValue: string;
  cashBalance: string;
  cashflowReserve: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  CORE: "Core",
  MAD_MONEY: "Mad Money",
  FREE_CAPITAL: "Free Capital",
  RISK_MGMT: "Risk Mgmt",
};

const CATEGORY_COLORS: Record<string, string> = {
  CORE: "#6366f1",
  MAD_MONEY: "#f59e0b",
  FREE_CAPITAL: "#22c55e",
  RISK_MGMT: "#ef4444",
};

export default function WealthWheelPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [wheel, setWheel] = useState<WheelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/accounts/${accountId}/wheel`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.slices && Array.isArray(data.slices)) {
          setWheel(data);
          const t: Record<string, string> = {};
          data.slices.forEach((s: WheelSlice) => {
            t[s.category] = s.targetPct;
          });
          setTargets(t);
        } else {
          setWheel(null);
        }
        setLoading(false);
      });
  }, [accountId]);

  const handleSaveTargets = async () => {
    setSaving(true);
    await fetch(`/api/accounts/${accountId}/wheel`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targets: Object.entries(targets).map(([category, targetPct]) => ({
          category,
          targetPct: parseFloat(targetPct),
        })),
      }),
    });
    setSaving(false);
    setEditing(false);
    // Refresh
    const data = await fetch(`/api/accounts/${accountId}/wheel`).then((r) => r.json());
    setWheel(data);
  };

  if (loading) {
    return <div className="animate-pulse h-96 bg-card rounded-xl" />;
  }

  if (!wheel) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted">Wealth Wheel data could not be loaded.</p>
        <Link href={`/accounts/${accountId}`} className="text-accent hover:underline mt-2 inline-block">
          Back to Account
        </Link>
      </div>
    );
  }

  const totalValue = parseFloat(wheel.totalValue);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href={`/accounts/${accountId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Wealth Wheel</h1>
          <p className="text-muted text-sm">
            Cost basis allocation (MVP) &middot; Total: ${totalValue.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Wheel Visualization */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <Card className="flex items-center justify-center py-8">
          <div className="relative w-64 h-64">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {(() => {
                let offset = 0;
                return wheel.slices.map((slice) => {
                  const pct = parseFloat(slice.actualPct);
                  const circumference = Math.PI * 70;
                  const strokeLength = (pct / 100) * circumference;
                  const gap = 1;
                  const el = (
                    <circle
                      key={slice.category}
                      cx="50"
                      cy="50"
                      r="35"
                      fill="none"
                      stroke={CATEGORY_COLORS[slice.category]}
                      strokeWidth="12"
                      strokeDasharray={`${Math.max(0, strokeLength - gap)} ${circumference - strokeLength + gap}`}
                      strokeDashoffset={-offset}
                      className="transition-all duration-500"
                    />
                  );
                  offset += strokeLength;
                  return el;
                });
              })()}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold">${totalValue.toLocaleString()}</p>
              <p className="text-xs text-muted">Total Value</p>
            </div>
          </div>
        </Card>

        {/* Slices Detail */}
        <div className="space-y-3">
          {wheel.slices.map((slice) => {
            const actual = parseFloat(slice.actualPct);
            const target = parseFloat(slice.targetPct);
            const delta = parseFloat(slice.delta);
            const value = parseFloat(slice.currentValue);

            return (
              <Card key={slice.category} className="!p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[slice.category] }}
                    />
                    <div>
                      <p className="font-medium text-sm">
                        {CATEGORY_LABELS[slice.category]}
                      </p>
                      <p className="text-xs text-muted">
                        ${value.toLocaleString()} &middot; {actual.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={wheelCategoryBadgeVariant(slice.category)}>
                      Target: {target.toFixed(0)}%
                    </Badge>
                    <p
                      className={`text-xs mt-1 ${
                        delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(1)}% vs target
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(actual, 100)}%`,
                      backgroundColor: CATEGORY_COLORS[slice.category],
                    }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Edit Targets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Allocation Targets</CardTitle>
            {!editing ? (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Edit Targets
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveTargets} loading={saving}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <Input
              key={key}
              label={label}
              type="number"
              value={targets[key] || "0"}
              onChange={(e) => setTargets({ ...targets, [key]: e.target.value })}
              disabled={!editing}
              min="0"
              max="100"
              step="1"
              hint={editing ? "%" : undefined}
            />
          ))}
        </div>
      </Card>

      {/* Cash Balances */}
      <Card>
        <CardHeader>
          <CardTitle>Cash Balances</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-3xl font-bold text-success">
              ${parseFloat(wheel.cashBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted mt-1">Free Cash</p>
          </div>
          <div>
            <p className="text-3xl font-bold">
              ${parseFloat(wheel.cashflowReserve).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted mt-1">Cashflow Reserve</p>
          </div>
        </div>
        <p className="text-xs text-muted mt-4">
          Manage cash balances from the account detail page.
        </p>
      </Card>
    </div>
  );
}
