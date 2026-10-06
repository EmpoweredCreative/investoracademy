"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/live/primitives";
import { METRICS, type CriteriaProfile, type MetricDef, type MetricKey } from "@/lib/fundamentals/criteria";
import { ANALYST_NAME } from "@/lib/brand";

/** Edit the thresholds Claude and the research pages score stocks against. */
export function CriteriaEditor() {
  const [profile, setProfile] = useState<CriteriaProfile | null>(null);
  const [defaults, setDefaults] = useState<CriteriaProfile | null>(null);
  const [metrics, setMetrics] = useState<Record<MetricKey, MetricDef> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/research-criteria")
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.profile);
        setDefaults(d.defaults);
        setMetrics(d.metrics);
      })
      .catch(() => setError("Could not load criteria"));
  }, []);

  if (!profile || !metrics) {
    return <div id="research-criteria" className="h-64 rounded-2xl border border-border bg-card animate-pulse" />;
  }

  const save = async () => {
    setSaving(true);
    setError("");
    const res = await fetch("/api/research-criteria", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
    else setError((await res.json().catch(() => ({}))).error ?? "Could not save");
  };

  return (
    <div id="research-criteria" className="scroll-mt-28">
      <Panel
        title="Research criteria"
        subtitle={`your thresholds for fundamentals, used by the research pages and the ${ANALYST_NAME}`}
        right={
          defaults && (
            <button
              type="button"
              onClick={() => {
                setProfile(defaults);
                setSaved(false);
              }}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
            >
              <RotateCcw className="w-3 h-3" /> Defaults
            </button>
          )
        }
        bodyClassName="p-0"
      >
        <CriteriaTable
          profile={profile}
          metrics={metrics}
          onChange={(next) => {
            setSaved(false);
            setProfile(next);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            Pass at a weighted score of
            <input
              type="number"
              min={0}
              max={100}
              value={profile.passScore}
              onChange={(e) => {
                setSaved(false);
                setProfile({ ...profile, passScore: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) });
              }}
              className="num w-16 px-2 py-1 bg-background border border-border rounded-lg text-right"
            />
            <span className="text-muted">/ 100</span>
          </label>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-danger">{error}</span>}
            {saved && (
              <span className="flex items-center gap-1 text-xs text-success">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <Button size="sm" onClick={save} loading={saving}>
              Save criteria
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** Controlled criteria table: thresholds, weights and required flags per metric. */
export function CriteriaTable({
  profile,
  onChange,
  metrics = METRICS,
}: {
  profile: CriteriaProfile;
  onChange: (next: CriteriaProfile) => void;
  metrics?: Record<MetricKey, MetricDef>;
}) {
  const update = (key: MetricKey, patch: Partial<CriteriaProfile["criteria"][number]>) =>
    onChange({ ...profile, criteria: profile.criteria.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.12em] text-muted border-b border-border">
            <th className="text-left font-semibold px-4 py-2">Use</th>
            <th className="text-left font-semibold px-2 py-2">Metric</th>
            <th className="text-right font-semibold px-2 py-2">Good</th>
            <th className="text-right font-semibold px-2 py-2">OK</th>
            <th className="text-right font-semibold px-2 py-2">Weight</th>
            <th className="text-center font-semibold px-4 py-2">Must be good</th>
          </tr>
        </thead>
        <tbody>
          {profile.criteria.map((c) => {
            const def = metrics[c.key];
            const op = def.better === "lower" ? "≤" : "≥";
            const u = def.unit === "%" ? "%" : "×";
            return (
              <tr key={c.key} className={`border-b border-border/60 ${c.enabled ? "" : "opacity-50"}`}>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => update(c.key, { enabled: e.target.checked })}
                    className="accent-[var(--accent)]"
                    aria-label={`Use ${def.name}`}
                  />
                </td>
                <td className="px-2 py-2">
                  <div className="font-medium">{def.name}</div>
                  <div className="text-[11px] text-muted">{def.help}</div>
                </td>
                <td className="px-2 py-2 text-right">
                  <Threshold op={op} unit={u} value={c.good} onChange={(v) => update(c.key, { good: v })} disabled={!c.enabled} />
                </td>
                <td className="px-2 py-2 text-right">
                  <Threshold op={op} unit={u} value={c.ok} onChange={(v) => update(c.key, { ok: v })} disabled={!c.enabled} />
                </td>
                <td className="px-2 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={1}
                    value={c.weight}
                    disabled={!c.enabled}
                    onChange={(e) => update(c.key, { weight: Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)) })}
                    className="num w-14 px-2 py-1 bg-background border border-border rounded-lg text-right"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={c.required}
                    disabled={!c.enabled}
                    onChange={(e) => update(c.key, { required: e.target.checked })}
                    className="accent-[var(--accent)]"
                    aria-label={`${def.name} must be good`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Threshold({
  op,
  unit,
  value,
  onChange,
  disabled,
}: {
  op: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-muted">
      {op}
      <input
        type="number"
        step="any"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className="num w-16 px-2 py-1 bg-background border border-border rounded-lg text-right text-foreground"
      />
      <span className="w-3 text-left">{unit}</span>
    </span>
  );
}
