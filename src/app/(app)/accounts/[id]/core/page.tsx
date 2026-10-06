"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Coins, Target, TrendingUp, Repeat } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CORE_PLAN_LABELS, CORE_PLAN_MODES, type CorePlanModeValue } from "@/lib/buckets";

interface Holding {
  underlyingId: string;
  symbol: string;
  currentPrice: number | null;
  shares: number;
  premiumFundedShares: number;
  plan: {
    mode: CorePlanModeValue;
    shareGoal: number | null;
    modeAfterGoal: CorePlanModeValue;
    reinvestThresholdShares: number;
    isDefault: boolean;
  };
  bucketBalance: number;
  premiumEarned: number;
  reinvested: number;
  basisApplied: number;
  cashedOut: number;
  canBuyShares: number | null;
  pendingSignal: { id: string; amount: number; notes: string | null } | null;
  growth: { date: string; cashShares: number; premiumShares: number }[];
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const MODE_OPTIONS = CORE_PLAN_MODES.map((m) => ({ value: m, label: CORE_PLAN_LABELS[m].label }));

export default function CorePremiumPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounts/${accountId}/core`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load core holdings");
      setHoldings(data.holdings ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load core holdings");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-24 bg-card rounded-xl" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="animate-pulse h-80 bg-card rounded-xl" />
          <div className="animate-pulse h-80 bg-card rounded-xl" />
        </div>
      </div>
    );
  }

  const totals = holdings.reduce(
    (t, h) => ({
      earned: t.earned + h.premiumEarned,
      inBuckets: t.inBuckets + h.bucketBalance,
      reinvested: t.reinvested + h.reinvested,
      premiumShares: t.premiumShares + h.premiumFundedShares,
    }),
    { earned: 0, inBuckets: 0, reinvested: 0, premiumShares: 0 }
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href={`/accounts/${accountId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Core Premium</h1>
          <p className="text-muted text-sm">
            Premium from covered calls and puts on your core stocks, and where it goes.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Coins} label="Premium earned" value={usd(totals.earned)} />
        <Stat icon={Repeat} label="Waiting in buckets" value={usd(totals.inBuckets)} />
        <Stat icon={TrendingUp} label="Reinvested" value={usd(totals.reinvested)} />
        <Stat
          icon={Target}
          label="Shares bought with premium"
          value={totals.premiumShares.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        />
      </div>

      {holdings.length === 0 ? (
        <Card>
          <CardTitle>No core holdings yet</CardTitle>
          <CardDescription>
            Add a stock purchase with the Core Investments bucket to start tracking its premium.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {holdings.map((h) => (
            <HoldingCard key={h.underlyingId} accountId={accountId} holding={h} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted text-xs mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function HoldingCard({
  accountId,
  holding: h,
  onChange,
}: {
  accountId: string;
  holding: Holding;
  onChange: () => void;
}) {
  const [editingPlan, setEditingPlan] = useState(false);
  const [buying, setBuying] = useState(false);

  const goalPct = h.plan.shareGoal ? Math.min(100, (h.shares / h.plan.shareGoal) * 100) : null;
  const goalReached = h.plan.shareGoal != null && h.shares >= h.plan.shareGoal;

  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <GoalRing pct={goalPct} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{h.symbol}</h2>
              <Badge variant="core">{CORE_PLAN_LABELS[h.plan.mode].label}</Badge>
              {h.plan.isDefault && <Badge>Default plan</Badge>}
            </div>
            <p className="text-sm text-muted tabular-nums">
              {h.shares.toLocaleString()} shares
              {h.plan.shareGoal ? ` of ${h.plan.shareGoal.toLocaleString()} goal` : ""}
              {h.currentPrice ? ` · ${usd(h.currentPrice)}` : ""}
            </p>
            {goalReached && (
              <p className="text-xs text-success mt-0.5">
                Goal reached · premium now goes to {CORE_PLAN_LABELS[h.plan.modeAfterGoal].label.toLowerCase()}
              </p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditingPlan((v) => !v)}>
          {editingPlan ? "Close" : "Edit plan"}
        </Button>
      </div>

      {editingPlan && (
        <PlanEditor
          accountId={accountId}
          holding={h}
          onSaved={() => {
            setEditingPlan(false);
            onChange();
          }}
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Metric label="Bucket" value={usd(h.bucketBalance)} highlight={h.bucketBalance > 0} />
        <Metric label="Earned" value={usd(h.premiumEarned)} />
        <Metric label="Reinvested" value={usd(h.reinvested)} />
        <Metric
          label={h.basisApplied > 0 ? "Basis lowered" : "Cashed out"}
          value={usd(h.basisApplied > 0 ? h.basisApplied : h.cashedOut)}
        />
      </div>

      {h.plan.mode === "ACCUMULATE" && h.bucketBalance > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-core/30 bg-core/5 px-4 py-3">
          <div className="text-sm">
            {h.canBuyShares != null && h.canBuyShares > 0 ? (
              <>
                Bucket can buy <span className="font-semibold">{h.canBuyShares}</span> share
                {h.canBuyShares === 1 ? "" : "s"} of {h.symbol}
              </>
            ) : h.currentPrice ? (
              <>Keep collecting: {usd(Math.max(0, h.currentPrice - h.bucketBalance))} more buys 1 share</>
            ) : (
              <>Refresh prices on the portfolio page to see how many shares the bucket can buy</>
            )}
          </div>
          <Button size="sm" onClick={() => setBuying((v) => !v)}>
            {buying ? "Cancel" : "Log reinvest"}
          </Button>
        </div>
      )}

      {buying && (
        <ReinvestForm
          accountId={accountId}
          holding={h}
          onDone={() => {
            setBuying(false);
            onChange();
          }}
        />
      )}

      <ShareGrowthChart growth={h.growth} />
    </Card>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-background/60 border border-border px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-semibold tabular-nums ${highlight ? "text-core" : ""}`}>{value}</div>
    </div>
  );
}

function GoalRing({ pct }: { pct: number | null }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const filled = pct == null ? 0 : (pct / 100) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-label={pct == null ? "No share goal" : `${pct.toFixed(0)}% of share goal`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-border)" strokeWidth="5" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="var(--color-core)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c}`}
        transform="rotate(-90 28 28)"
        style={{ transition: "stroke-dasharray 600ms ease" }}
      />
      <text x="28" y="32" textAnchor="middle" fontSize="11" fill="var(--color-foreground)" fontWeight="600">
        {pct == null ? "—" : `${pct.toFixed(0)}%`}
      </text>
    </svg>
  );
}

function PlanEditor({
  accountId,
  holding: h,
  onSaved,
}: {
  accountId: string;
  holding: Holding;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<CorePlanModeValue>(h.plan.mode);
  const [shareGoal, setShareGoal] = useState(h.plan.shareGoal?.toString() ?? "");
  const [modeAfterGoal, setModeAfterGoal] = useState<CorePlanModeValue>(h.plan.modeAfterGoal);
  const [threshold, setThreshold] = useState(h.plan.reinvestThresholdShares.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/accounts/${accountId}/core/${h.underlyingId}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        shareGoal: shareGoal ? parseInt(shareGoal, 10) : null,
        modeAfterGoal,
        reinvestThresholdShares: parseInt(threshold, 10) || 1,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save plan");
      return;
    }
    onSaved();
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-4 bg-background/40">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Select
            label="What happens to premium"
            value={mode}
            onChange={(e) => setMode(e.target.value as CorePlanModeValue)}
            options={MODE_OPTIONS}
          />
          <p className="text-xs text-muted mt-1">{CORE_PLAN_LABELS[mode].description}</p>
        </div>
        <Input
          label="Share goal (optional)"
          type="number"
          min={1}
          value={shareGoal}
          onChange={(e) => setShareGoal(e.target.value)}
          hint="When you hold this many shares, the plan switches."
        />
        <Select
          label="After the goal is reached"
          value={modeAfterGoal}
          onChange={(e) => setModeAfterGoal(e.target.value as CorePlanModeValue)}
          options={MODE_OPTIONS}
          disabled={!shareGoal}
        />
        <Input
          label="Suggest a reinvest at (shares)"
          type="number"
          min={1}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted">Changes apply to premium from future closes. Past premium stays where it went.</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={save} loading={saving}>
          Save plan
        </Button>
      </div>
    </div>
  );
}

function ReinvestForm({
  accountId,
  holding: h,
  onDone,
}: {
  accountId: string;
  holding: Holding;
  onDone: () => void;
}) {
  const [shares, setShares] = useState((h.canBuyShares ?? 1).toString());
  const [price, setPrice] = useState(h.currentPrice?.toString() ?? "");
  const [fees, setFees] = useState("0");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const cost = (parseFloat(shares) || 0) * (parseFloat(price) || 0) + (parseFloat(fees) || 0);
  const fromBucket = Math.min(Math.max(h.bucketBalance, 0), cost);

  const submit = async () => {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/accounts/${accountId}/core/${h.underlyingId}/reinvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shares: parseFloat(shares),
        price: parseFloat(price),
        fees: parseFloat(fees) || 0,
        occurredAt: new Date(date).toISOString(),
        signalId: h.pendingSignal?.id,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not record the purchase");
      return;
    }
    onDone();
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-4 bg-background/40">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Input label="Shares" type="number" min={0} step="any" value={shares} onChange={(e) => setShares(e.target.value)} />
        <Input label="Price" type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input label="Fees" type="number" min={0} step="any" value={fees} onChange={(e) => setFees(e.target.value)} />
        <Input label="Date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <p className="text-sm text-muted tabular-nums">
        Total {usd(cost)} · {usd(fromBucket)} from the {h.symbol} bucket
        {cost > fromBucket ? ` · ${usd(cost - fromBucket)} from cash` : ""}
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} loading={saving} disabled={!(parseFloat(shares) > 0 && parseFloat(price) > 0)}>
          Record purchase
        </Button>
      </div>
    </div>
  );
}

/** Stacked step chart: shares bought with cash vs. with premium over time. */
function ShareGrowthChart({ growth }: { growth: Holding["growth"] }) {
  if (growth.length === 0) return null;

  const W = 560;
  const H = 120;
  const pad = 4;
  const points = growth.length === 1 ? [growth[0], { ...growth[0], date: new Date().toISOString() }] : growth;
  const t0 = new Date(points[0].date).getTime();
  const t1 = Math.max(new Date(points[points.length - 1].date).getTime(), t0 + 1);
  const maxShares = Math.max(...points.map((p) => p.cashShares + p.premiumShares), 1);
  const x = (d: string) => pad + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / maxShares) * (H - pad * 2);

  const stepPath = (value: (p: (typeof points)[0]) => number, base: (p: (typeof points)[0]) => number) => {
    let top = `M ${x(points[0].date)} ${y(value(points[0]))}`;
    for (let i = 1; i < points.length; i++) {
      top += ` H ${x(points[i].date)} V ${y(value(points[i]))}`;
    }
    let bottom = "";
    for (let i = points.length - 1; i >= 1; i--) {
      bottom += ` V ${y(base(points[i]))} H ${x(points[i - 1].date)}`;
    }
    bottom += ` V ${y(base(points[0]))} Z`;
    return top + bottom;
  };

  const last = growth[growth.length - 1];
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted mb-2">
        <span>Share growth</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-muted/60" /> Cash {last.cashShares.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-core" /> Premium {last.premiumShares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none" role="img" aria-label="Share count over time">
        <path d={stepPath((p) => p.cashShares, () => 0)} fill="var(--color-muted)" opacity="0.35" />
        <path
          d={stepPath((p) => p.cashShares + p.premiumShares, (p) => p.cashShares)}
          fill="var(--color-core)"
          opacity="0.85"
        />
      </svg>
    </div>
  );
}
