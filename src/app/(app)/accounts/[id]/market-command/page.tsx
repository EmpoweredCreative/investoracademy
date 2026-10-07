"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import {
  ArrowLeft,
  ArrowRight,
  Gauge,
} from "lucide-react";
import { localDateStr } from "@/lib/routineSteps";

export default function MarketCommandPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [dateStr, setDateStr] = useState(localDateStr);
  const [data, setData] = useState<{
    routine: Record<string, unknown> | null;
    environment: Record<string, unknown> | null;
    aiInsights: Array<Record<string, unknown>>;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/accounts/${accountId}/market-command/routine?date=${dateStr}`)
      .then((res) => res.json())
      .then((json) =>
        setData({
          routine: json.routine,
          environment: json.environment,
          aiInsights: json.aiInsights ?? [],
        })
      )
      .catch(() => {});
  }, [accountId, dateStr]);

  const env = data?.environment as { environmentScore?: number; environmentLabel?: string; environmentConfidence?: number; alignmentScore?: number } | null;

  const tabs = [
    { id: "alignment", label: "Strategy Alignment" },
    { id: "analytics", label: "Analytics" },
  ];
  const [activeTab, setActiveTab] = useState("alignment");

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
              Market environment, strategy alignment and analytics
            </p>
          </div>
        </div>
      </div>

      <Link
        href="/traders-corner"
        className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm hover:bg-accent/10 transition-colors"
      >
        <span>
          <span className="font-semibold">The daily routine now lives in Trader&apos;s Corner</span>
          <span className="text-muted"> — your index and sector calls there feed the alignment below.</span>
        </span>
        <ArrowRight className="w-4 h-4 text-accent shrink-0" />
      </Link>

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
