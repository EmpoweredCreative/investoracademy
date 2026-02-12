"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ArrowLeft, CheckCircle } from "lucide-react";
import Link from "next/link";

// ── Strategy definitions ─────────────────────────────────────

type StrategyKey =
  | "COVERED_CALL"
  | "SHORT_PUT"
  | "BULL_PUT_SPREAD"
  | "BEAR_CALL_SPREAD"
  | "BULL_CALL_SPREAD"
  | "BEAR_PUT_SPREAD"
  | "IRON_CONDOR"
  | "IRON_BUTTERFLY"
  | "SHORT_STRANGLE"
  | "TIME_SPREAD"
  | "LEAP_CALL"
  | "LEAP_PUT";

interface LegTemplate {
  label: string;
  action: string;
  callPut: "CALL" | "PUT";
  strikePlaceholder: string;
}

interface StrategyDef {
  label: string;
  legs: LegTemplate[];
}

const STRATEGIES: Record<StrategyKey, StrategyDef> = {
  COVERED_CALL: {
    label: "Covered Call",
    legs: [{ label: "Short Call", action: "STO", callPut: "CALL", strikePlaceholder: "e.g. 185" }],
  },
  SHORT_PUT: {
    label: "Short Put",
    legs: [{ label: "Short Put", action: "STO", callPut: "PUT", strikePlaceholder: "e.g. 170" }],
  },
  LEAP_CALL: {
    label: "LEAP Call",
    legs: [{ label: "Long Call", action: "BTO", callPut: "CALL", strikePlaceholder: "e.g. 150" }],
  },
  LEAP_PUT: {
    label: "LEAP Put",
    legs: [{ label: "Long Put", action: "BTO", callPut: "PUT", strikePlaceholder: "e.g. 200" }],
  },
  BULL_PUT_SPREAD: {
    label: "Bull Put Spread (Credit)",
    legs: [
      { label: "Short Put (higher strike)", action: "STO", callPut: "PUT", strikePlaceholder: "e.g. 180" },
      { label: "Long Put (lower strike)", action: "BTO", callPut: "PUT", strikePlaceholder: "e.g. 170" },
    ],
  },
  BEAR_CALL_SPREAD: {
    label: "Bear Call Spread (Credit)",
    legs: [
      { label: "Short Call (lower strike)", action: "STO", callPut: "CALL", strikePlaceholder: "e.g. 190" },
      { label: "Long Call (higher strike)", action: "BTO", callPut: "CALL", strikePlaceholder: "e.g. 200" },
    ],
  },
  BULL_CALL_SPREAD: {
    label: "Bull Call Spread (Debit)",
    legs: [
      { label: "Long Call (lower strike)", action: "BTO", callPut: "CALL", strikePlaceholder: "e.g. 180" },
      { label: "Short Call (higher strike)", action: "STO", callPut: "CALL", strikePlaceholder: "e.g. 190" },
    ],
  },
  BEAR_PUT_SPREAD: {
    label: "Bear Put Spread (Debit)",
    legs: [
      { label: "Long Put (higher strike)", action: "BTO", callPut: "PUT", strikePlaceholder: "e.g. 190" },
      { label: "Short Put (lower strike)", action: "STO", callPut: "PUT", strikePlaceholder: "e.g. 180" },
    ],
  },
  IRON_CONDOR: {
    label: "Iron Condor",
    legs: [
      { label: "Short Put", action: "STO", callPut: "PUT", strikePlaceholder: "e.g. 170" },
      { label: "Long Put (lower)", action: "BTO", callPut: "PUT", strikePlaceholder: "e.g. 165" },
      { label: "Short Call", action: "STO", callPut: "CALL", strikePlaceholder: "e.g. 190" },
      { label: "Long Call (higher)", action: "BTO", callPut: "CALL", strikePlaceholder: "e.g. 195" },
    ],
  },
  IRON_BUTTERFLY: {
    label: "Iron Butterfly",
    legs: [
      { label: "Short Put (ATM)", action: "STO", callPut: "PUT", strikePlaceholder: "e.g. 180" },
      { label: "Long Put (lower)", action: "BTO", callPut: "PUT", strikePlaceholder: "e.g. 170" },
      { label: "Short Call (ATM)", action: "STO", callPut: "CALL", strikePlaceholder: "e.g. 180" },
      { label: "Long Call (higher)", action: "BTO", callPut: "CALL", strikePlaceholder: "e.g. 190" },
    ],
  },
  SHORT_STRANGLE: {
    label: "Short Strangle",
    legs: [
      { label: "Short Put", action: "STO", callPut: "PUT", strikePlaceholder: "e.g. 170" },
      { label: "Short Call", action: "STO", callPut: "CALL", strikePlaceholder: "e.g. 190" },
    ],
  },
  TIME_SPREAD: {
    label: "Time Spread (Calendar)",
    legs: [
      { label: "Short (near exp)", action: "STO", callPut: "CALL", strikePlaceholder: "e.g. 180" },
      { label: "Long (far exp)", action: "BTO", callPut: "CALL", strikePlaceholder: "e.g. 180" },
    ],
  },
};

const STRATEGY_OPTIONS = Object.entries(STRATEGIES).map(([value, def]) => ({
  value,
  label: def.label,
}));

// ── Component ────────────────────────────────────────────────

interface LegState {
  strike: string;
  quantity: string;
  price: string;
  delta: string;
}

export default function OptionEntryPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;

  const [strategyType, setStrategyType] = useState<StrategyKey>("SHORT_PUT");
  const [symbol, setSymbol] = useState("");
  const [expiration, setExpiration] = useState("");
  const [fees, setFees] = useState("0");
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [premiumPolicy, setPremiumPolicy] = useState("");
  const [wheelCategory, setWheelCategory] = useState("CORE");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Leg state — one per leg template
  const strategy = STRATEGIES[strategyType];
  const [legs, setLegs] = useState<LegState[]>(
    strategy.legs.map(() => ({ strike: "", quantity: "1", price: "", delta: "" }))
  );

  const handleStrategyChange = (key: StrategyKey) => {
    setStrategyType(key);
    const def = STRATEGIES[key];
    setLegs(def.legs.map(() => ({ strike: "", quantity: "1", price: "", delta: "" })));
  };

  const updateLeg = (index: number, field: keyof LegState, value: string) => {
    setLegs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const primaryLeg = strategy.legs[0];
      const primaryState = legs[0];

      const body: Record<string, unknown> = {
        symbol,
        strategyType,
        action: primaryLeg.action,
        callPut: primaryLeg.callPut,
        strike: parseFloat(primaryState.strike),
        expiration: new Date(expiration).toISOString(),
        quantity: parseFloat(primaryState.quantity),
        price: parseFloat(primaryState.price),
        entryDelta: primaryState.delta ? parseFloat(primaryState.delta) : undefined,
        fees: parseFloat(fees || "0"),
        occurredAt: new Date(occurredAt).toISOString(),
        premiumPolicyOverride: premiumPolicy || undefined,
        wheelCategoryOverride: wheelCategory || undefined,
        notes: notes || undefined,
      };

      // Additional legs
      if (strategy.legs.length > 1) {
        body.additionalLegs = strategy.legs.slice(1).map((template, i) => ({
          action: template.action,
          callPut: template.callPut,
          strike: parseFloat(legs[i + 1].strike),
          quantity: parseFloat(legs[i + 1].quantity),
          price: parseFloat(legs[i + 1].price),
        }));
      }

      const res = await fetch(`/api/accounts/${accountId}/option`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create entry");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/accounts/${accountId}`);
      }, 1500);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <CheckCircle className="w-16 h-16 text-success mb-4" />
        <h2 className="text-xl font-bold">Option Entry Recorded</h2>
        <p className="text-muted mt-2">
          {strategy.label} on {symbol}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/accounts/${accountId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add Option Trade</h1>
          <p className="text-muted text-sm">Enter an options contract transaction</p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}

          {/* Strategy type */}
          <Select
            label="Strategy Type"
            value={strategyType}
            onChange={(e) => handleStrategyChange(e.target.value as StrategyKey)}
            options={STRATEGY_OPTIONS}
          />

          {/* Shared fields */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Underlying Symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              required
            />
            <Input
              label="Expiration"
              type="date"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              required
            />
          </div>

          {/* Legs */}
          {strategy.legs.map((template, i) => (
            <div
              key={`${strategyType}-${i}`}
              className="rounded-lg border border-border p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  Leg {strategy.legs.length > 1 ? i + 1 : ""}: {template.label}
                </span>
                <span className="text-xs text-muted">
                  ({template.action} {template.callPut})
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Input
                  label="Strike"
                  type="number"
                  value={legs[i].strike}
                  onChange={(e) => updateLeg(i, "strike", e.target.value)}
                  placeholder={template.strikePlaceholder}
                  required
                  min="0.01"
                  step="0.01"
                />
                <Input
                  label="Contracts"
                  type="number"
                  value={legs[i].quantity}
                  onChange={(e) => updateLeg(i, "quantity", e.target.value)}
                  placeholder="1"
                  required
                  min="1"
                />
                <Input
                  label="Premium/Contract"
                  type="number"
                  value={legs[i].price}
                  onChange={(e) => updateLeg(i, "price", e.target.value)}
                  placeholder="2.50"
                  required
                  min="0"
                  step="0.01"
                />
                <Input
                  label="Delta"
                  type="number"
                  value={legs[i].delta}
                  onChange={(e) => updateLeg(i, "delta", e.target.value)}
                  placeholder="0.30"
                  min="-1"
                  max="1"
                  step="0.01"
                />
              </div>
            </div>
          ))}

          {/* Common fields */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Total Fees"
              type="number"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              placeholder="0.65"
              min="0"
              step="0.01"
            />
            <Input
              label="Date & Time"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Premium Policy Override"
              value={premiumPolicy}
              onChange={(e) => setPremiumPolicy(e.target.value)}
              options={[
                { value: "", label: "Use default" },
                { value: "CASHFLOW", label: "Cashflow" },
                { value: "BASIS_REDUCTION", label: "Basis Reduction" },
                { value: "REINVEST_ON_CLOSE", label: "Reinvest on Close" },
              ]}
            />
            <Select
              label="Wheel Category"
              value={wheelCategory}
              onChange={(e) => setWheelCategory(e.target.value)}
              options={[
                { value: "CORE", label: "Core" },
                { value: "MAD_MONEY", label: "Mad Money" },
                { value: "FREE_CAPITAL", label: "Free Capital" },
                { value: "RISK_MGMT", label: "Risk Management" },
              ]}
            />
          </div>

          <Input
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Trade thesis or notes..."
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              Record {strategy.label}
            </Button>
            <Link href={`/accounts/${accountId}`}>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
