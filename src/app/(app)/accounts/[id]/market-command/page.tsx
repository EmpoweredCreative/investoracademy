"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import {
  ArrowLeft,
  Gauge,
  Loader2,
} from "lucide-react";
import { INDICES, SECTORS } from "@/lib/marketRoutineSymbols";

const BIAS_OPTIONS = [
  { value: "", label: "—" },
  { value: "BULLISH", label: "Bullish" },
  { value: "BEARISH", label: "Bearish" },
  { value: "NEUTRAL", label: "Neutral" },
];

function BiasLight({ bias }: { bias: string | null }) {
  if (!bias) return null;
  const config =
    bias === "BULLISH"
      ? { bg: "bg-emerald-500", ring: "ring-emerald-500/30", label: "Bullish" }
      : bias === "BEARISH"
        ? { bg: "bg-red-500", ring: "ring-red-500/30", label: "Bearish" }
        : { bg: "bg-amber-500", ring: "ring-amber-500/30", label: "Neutral" };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${config.bg} ring-2 ${config.ring}`}
      title={config.label}
      aria-label={config.label}
    />
  );
}

export default function MarketCommandPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<{
    routine: Record<string, unknown> | null;
    environment: Record<string, unknown> | null;
    aiInsights: Array<Record<string, unknown>>;
  } | null>(null);

  const [form, setForm] = useState({
    symbolBiases: {} as Record<string, { bias: string; dailyVolume: string }>,
    narrativeTags: "",
    notes: "",
    routineCompleted: false,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/market-command/routine?date=${dateStr}`
      );
      const json = await res.json();
      setData({
        routine: json.routine,
        environment: json.environment,
        aiInsights: json.aiInsights ?? [],
      });
      if (json.routine) {
        const biases: Record<string, { bias: string; dailyVolume: string }> = {};
        for (const s of json.routine.symbolBiases ?? []) {
          biases[s.symbol] = {
            bias: s.bias ?? "",
            dailyVolume: s.dailyVolume != null ? String(s.dailyVolume) : "",
          };
        }
        setForm({
          symbolBiases: biases,
          narrativeTags: Array.isArray(json.routine.narrativeTags)
            ? json.routine.narrativeTags.join(", ")
            : "",
          notes: json.routine.notes ?? "",
          routineCompleted: json.routine.routineCompleted ?? false,
        });
      } else {
        setForm((f) => ({ ...f, symbolBiases: {} }));
      }
    } finally {
      setLoading(false);
    }
  }, [accountId, dateStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const symbolBiases = [
        ...INDICES.map((s) => {
          const v = form.symbolBiases[s.symbol]?.dailyVolume?.trim();
          const vol = v ? parseFloat(v) : NaN;
          return {
            symbol: s.symbol,
            category: "INDICES" as const,
            bias: form.symbolBiases[s.symbol]?.bias || null,
            dailyVolume: v && !isNaN(vol) ? vol : null,
          };
        }),
        ...SECTORS.map((s) => {
          const v = form.symbolBiases[s.symbol]?.dailyVolume?.trim();
          const vol = v ? parseFloat(v) : NaN;
          return {
            symbol: s.symbol,
            category: "SECTORS" as const,
            bias: form.symbolBiases[s.symbol]?.bias || null,
            dailyVolume: v && !isNaN(vol) ? vol : null,
          };
        }),
      ];
      await fetch(`/api/accounts/${accountId}/market-command/routine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr,
          narrativeTags: form.narrativeTags
            ? form.narrativeTags.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          notes: form.notes || null,
          routineCompleted: form.routineCompleted,
          symbolBiases,
        }),
      });
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const setSymbolBias = (symbol: string, field: "bias" | "dailyVolume", value: string) => {
    setForm((f) => ({
      ...f,
      symbolBiases: {
        ...f.symbolBiases,
        [symbol]: {
          ...(f.symbolBiases[symbol] ?? { bias: "", dailyVolume: "" }),
          [field]: value,
        },
      },
    }));
  };

  const env = data?.environment as { environmentScore?: number; environmentLabel?: string; environmentConfidence?: number; alignmentScore?: number } | null;

  const tabs = [
    { id: "routine", label: "Daily Routine" },
    { id: "alignment", label: "Strategy Alignment" },
    { id: "analytics", label: "Analytics" },
  ];
  const [activeTab, setActiveTab] = useState("routine");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/accounts/${accountId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gauge className="w-7 h-7 text-accent" />
              Market Command Center
            </h1>
            <p className="text-muted text-sm">
              Daily market routine and market environment
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-foreground">Date</label>
        <Input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="w-40"
        />
      </div>

      <Tabs tabs={tabs} onChange={setActiveTab}>
        {() => (
          <>
            {activeTab === "routine" && (
              <div className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Top-Down Market Routine</CardTitle>
                    <p className="text-sm text-muted">Bias + daily volume per index and sector. Volatility from VIX.</p>
                  </CardHeader>
                  {loading ? (
                    <div className="flex items-center gap-2 text-muted">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading…
                    </div>
                  ) : (
                    <form onSubmit={handleSaveRoutine} className="space-y-6">
                      <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Indices</p>
                        <div className="rounded-lg border border-border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-surface border-b border-border">
                                <th className="text-left py-2 px-3 font-semibold">Index Name</th>
                                <th className="text-left py-2 px-3 font-semibold">Bias</th>
                                <th className="text-left py-2 px-3 font-semibold">Daily Volume</th>
                              </tr>
                            </thead>
                            <tbody>
                              {INDICES.map((s) => (
                                <tr key={s.symbol} className="border-b border-border/50 last:border-0">
                                  <td className="py-2 px-3">
                                    <span className="inline-flex items-center gap-2">
                                      {s.name}
                                      {form.symbolBiases[s.symbol]?.bias && (
                                        <BiasLight bias={form.symbolBiases[s.symbol]?.bias ?? null} />
                                      )}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3">
                                    <select
                                      value={form.symbolBiases[s.symbol]?.bias ?? ""}
                                      onChange={(e) => setSymbolBias(s.symbol, "bias", e.target.value)}
                                      className="w-full max-w-28 px-2 py-1 rounded bg-surface border border-border text-foreground text-sm"
                                    >
                                      {BIAS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-2 px-3">
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder="—"
                                      value={form.symbolBiases[s.symbol]?.dailyVolume ?? ""}
                                      onChange={(e) => setSymbolBias(s.symbol, "dailyVolume", e.target.value)}
                                      className="w-full max-w-24 px-2 py-1 rounded bg-surface border border-border text-foreground text-sm"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Sectors</p>
                        <div className="rounded-lg border border-border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-surface border-b border-border">
                                <th className="text-left py-2 px-3 font-semibold">Symbol</th>
                                <th className="text-left py-2 px-3 font-semibold">Sector</th>
                                <th className="text-left py-2 px-3 font-semibold">Bias</th>
                                <th className="text-left py-2 px-3 font-semibold">Daily Volume</th>
                              </tr>
                            </thead>
                            <tbody>
                              {SECTORS.map((s) => (
                                <tr key={s.symbol} className="border-b border-border/50 last:border-0">
                                  <td className="py-2 px-3 font-mono">{s.symbol}</td>
                                  <td className="py-2 px-3">
                                    <span className="inline-flex items-center gap-2">
                                      {s.name}
                                      {form.symbolBiases[s.symbol]?.bias && (
                                        <BiasLight bias={form.symbolBiases[s.symbol]?.bias ?? null} />
                                      )}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3">
                                    <select
                                      value={form.symbolBiases[s.symbol]?.bias ?? ""}
                                      onChange={(e) => setSymbolBias(s.symbol, "bias", e.target.value)}
                                      className="w-full max-w-28 px-2 py-1 rounded bg-surface border border-border text-foreground text-sm"
                                    >
                                      {BIAS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-2 px-3">
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder="—"
                                      value={form.symbolBiases[s.symbol]?.dailyVolume ?? ""}
                                      onChange={(e) => setSymbolBias(s.symbol, "dailyVolume", e.target.value)}
                                      className="w-full max-w-24 px-2 py-1 rounded bg-surface border border-border text-foreground text-sm"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <Input
                        label="Narrative tags (comma-separated)"
                        placeholder="e.g. Fed, earnings"
                        value={form.narrativeTags}
                        onChange={(e) => setForm((f) => ({ ...f, narrativeTags: e.target.value }))}
                      />
                      <textarea
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground text-sm min-h-[80px]"
                        placeholder="Notes…"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.routineCompleted}
                          onChange={(e) => setForm((f) => ({ ...f, routineCompleted: e.target.checked }))}
                          className="rounded border-border"
                        />
                        <span className="text-sm">Routine completed</span>
                      </label>
                      <Button type="submit" loading={saving}>
                        Save Routine
                      </Button>
                    </form>
                  )}
                </Card>
              </div>
            )}

            {activeTab === "alignment" && (
              <StrategyAlignmentTab accountId={accountId} dateStr={dateStr} environmentLabel={env?.environmentLabel} />
            )}

            {activeTab === "analytics" && (
              <AnalyticsTab accountId={accountId} />
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}

function StrategyAlignmentTab({
  accountId,
  dateStr,
  environmentLabel,
}: {
  accountId: string;
  dateStr: string;
  environmentLabel?: string;
}) {
  const [recs, setRecs] = useState<{ favor: string[]; avoid: string[]; exposureBias: string; positionSizeAdjustment: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!environmentLabel) {
      setRecs(null);
      return;
    }
    setLoading(true);
    fetch(`/api/accounts/${accountId}/market-command/alignment?label=${encodeURIComponent(environmentLabel)}`)
      .then((r) => r.json())
      .then((data) => {
        setRecs(data.recommendations ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [accountId, environmentLabel]);

  if (!environmentLabel) {
    return (
      <Card className="mt-4">
        <p className="text-muted">Complete today’s routine and save to see strategy alignment for the current environment.</p>
      </Card>
    );
  }
  if (loading || !recs) {
    return (
      <Card className="mt-4">
        <p className="text-muted">Loading recommendations…</p>
      </Card>
    );
  }
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Strategy alignment for {environmentLabel}</CardTitle>
      </CardHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">Favor</p>
          <ul className="list-disc list-inside space-y-1 text-foreground">
            {recs.favor.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">Avoid</p>
          <ul className="list-disc list-inside space-y-1 text-foreground">
            {recs.avoid.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">
        Exposure bias: <strong className="text-foreground">{recs.exposureBias}</strong>
        {" · "}
        Position size: <strong className="text-foreground">{recs.positionSizeAdjustment * 100}%</strong>
      </p>
    </Card>
  );
}

function AnalyticsTab({ accountId }: { accountId: string }) {
  const [envStats, setEnvStats] = useState<Array<{ label: string; winRate: number; roi: number; count: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/accounts/${accountId}/market-command/analytics/environment`)
      .then((r) => r.json())
      .then((data) => {
        setEnvStats(data.byEnvironment ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [accountId]);

  if (loading) return <Card className="mt-4"><p className="text-muted">Loading analytics…</p></Card>;
  if (envStats.length === 0) return <Card className="mt-4"><p className="text-muted">No trade data by environment yet.</p></Card>;

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Performance by Market Environment</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-semibold">Environment</th>
                <th className="text-right py-2 font-semibold">Trades</th>
                <th className="text-right py-2 font-semibold">Win rate</th>
                <th className="text-right py-2 font-semibold">Avg ROI</th>
              </tr>
            </thead>
            <tbody>
              {envStats.map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2">{row.label}</td>
                  <td className="text-right py-2">{row.count}</td>
                  <td className="text-right py-2">{(row.winRate * 100).toFixed(1)}%</td>
                  <td className="text-right py-2">{row.roi != null ? `$${row.roi.toFixed(0)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
