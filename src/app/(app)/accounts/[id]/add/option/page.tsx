"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ArrowLeft, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function OptionEntryPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;

  const [symbol, setSymbol] = useState("");
  const [action, setAction] = useState("STO");
  const [callPut, setCallPut] = useState("PUT");
  const [strike, setStrike] = useState("");
  const [expiration, setExpiration] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("0");
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [premiumPolicy, setPremiumPolicy] = useState("");
  const [wheelCategory, setWheelCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/accounts/${accountId}/option`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          action,
          callPut,
          strike: parseFloat(strike),
          expiration: new Date(expiration).toISOString(),
          quantity: parseFloat(quantity),
          price: parseFloat(price),
          fees: parseFloat(fees || "0"),
          occurredAt: new Date(occurredAt).toISOString(),
          premiumPolicyOverride: premiumPolicy || undefined,
          wheelCategoryOverride: wheelCategory || undefined,
          notes: notes || undefined,
        }),
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
          {action} {quantity}x {symbol} ${strike} {callPut} @ ${price}
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

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Underlying Symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              required
            />
            <Select
              label="Action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              options={[
                { value: "STO", label: "STO - Sell to Open" },
                { value: "BTC", label: "BTC - Buy to Close" },
                { value: "BTO", label: "BTO - Buy to Open" },
                { value: "STC", label: "STC - Sell to Close" },
                { value: "EXPIRE", label: "Expire" },
                { value: "ASSIGN", label: "Assigned" },
                { value: "EXERCISE", label: "Exercise" },
              ]}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Call / Put"
              value={callPut}
              onChange={(e) => setCallPut(e.target.value)}
              options={[
                { value: "PUT", label: "Put" },
                { value: "CALL", label: "Call" },
              ]}
            />
            <Input
              label="Strike Price"
              type="number"
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
              placeholder="175.00"
              required
              min="0.01"
              step="0.01"
            />
            <Input
              label="Expiration"
              type="date"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Contracts"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
              required
              min="1"
            />
            <Input
              label="Premium/Contract"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="2.50"
              required
              min="0"
              step="0.01"
            />
            <Input
              label="Fees"
              type="number"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              placeholder="0.65"
              min="0"
              step="0.01"
            />
          </div>

          <Input
            label="Date & Time"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />

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
              label="Wheel Category Override"
              value={wheelCategory}
              onChange={(e) => setWheelCategory(e.target.value)}
              options={[
                { value: "", label: "Use default" },
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
              Record {action}
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
