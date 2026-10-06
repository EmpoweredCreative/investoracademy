"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  ArrowLeft,
  Upload,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  Loader2,
  Sparkles,
} from "lucide-react";

function alignmentBadge(humanBias: string | null, aiTrend: string | null) {
  if (!humanBias || !aiTrend) return { variant: "default" as const, label: "No comparison", icon: MinusCircle };
  if (humanBias === aiTrend) return { variant: "success" as const, label: "Aligned", icon: CheckCircle2 };
  if (
    (humanBias === "BULLISH" && aiTrend === "BEARISH") ||
    (humanBias === "BEARISH" && aiTrend === "BULLISH")
  )
    return { variant: "danger" as const, label: "Conflicting", icon: AlertTriangle };
  return { variant: "warning" as const, label: "Partial", icon: AlertTriangle };
}

export default function AIChartAssistPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState<{
    routine: Record<string, unknown> | null;
    environment: Record<string, unknown> | null;
    aiInsights: Array<Record<string, unknown>>;
  } | null>(null);

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
    } finally {
      setLoading(false);
    }
  }, [accountId, dateStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChartUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("chart", file);
      fd.append("date", dateStr);
      fd.append("symbol", "SPY");
      const res = await fetch(`/api/accounts/${accountId}/market-command/ai-chart`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Upload failed");
        return;
      }
      await fetchData();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const env = data?.environment as {
    environmentScore?: number;
    environmentLabel?: string;
    environmentConfidence?: number;
  } | null;
  const firstInsight = data?.aiInsights?.[0] as {
    aiTrendAssessment?: string;
    aiConfidenceScore?: number;
    aiStructureNotes?: string;
    symbol?: string;
  } | undefined;
  const symbolBiases = (data?.routine?.symbolBiases as Array<{ symbol: string; bias: string | null }>) ?? [];
  const mainBias =
    symbolBiases.find((s) => s.symbol === "SPY")?.bias ||
    symbolBiases.find((s) => s.symbol === "QQQ")?.bias ||
    null;
  const badge = alignmentBadge(mainBias ?? null, firstInsight?.aiTrendAssessment ?? null);

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
              <Sparkles className="w-7 h-7 text-accent" />
              AI Chart Assist
            </h1>
            <p className="text-muted text-sm">
              Upload charts for structured AI analysis. More features coming soon.
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

      <Card>
        <CardHeader>
          <CardTitle>Chart Analysis</CardTitle>
          <p className="text-sm text-muted">Upload a chart image for structured AI analysis</p>
        </CardHeader>
        <div className="space-y-4">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-card-hover transition-colors">
            <Upload className="w-8 h-8 text-muted mb-2" />
            <span className="text-sm text-muted">Drop chart image or click to upload</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleChartUpload}
              disabled={uploading}
            />
          </label>
          {uploading && (
            <div className="flex items-center gap-2 text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing chart…
            </div>
          )}
          {loading && !data && (
            <div className="flex items-center gap-2 text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          )}
          {firstInsight && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">AI vs Human</span>
                <Badge variant={badge.variant} className="flex items-center gap-1">
                  <badge.icon className="w-3 h-3" />
                  {badge.label}
                </Badge>
              </div>
              <p className="text-xs text-muted">
                AI trend: <strong>{firstInsight.aiTrendAssessment ?? "—"}</strong>
                {" · "}
                Confidence: {firstInsight.aiConfidenceScore ?? "—"}%
              </p>
              {firstInsight.aiStructureNotes && (
                <p className="text-sm text-foreground">{firstInsight.aiStructureNotes}</p>
              )}
            </div>
          )}
          {env && (
            <div className="rounded-lg bg-surface border border-border p-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Computed Environment</p>
              <p className="text-lg font-semibold text-foreground mt-1">{env.environmentLabel}</p>
              <p className="text-sm text-muted">
                Score: {env.environmentScore} · Confidence: {env.environmentConfidence}%
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
