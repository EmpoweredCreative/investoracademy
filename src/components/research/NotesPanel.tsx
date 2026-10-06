"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface ResearchRecord {
  verdict: string | null;
  notes: string | null;
  earningsNotes: string | null;
  earningsReviewedAt: string | null;
  mgmtCapitalAllocation: number | null;
  mgmtIncentives: number | null;
  mgmtExecution: number | null;
  brandPricingPower: number | null;
  brandLoyalty: number | null;
  brandTrust: number | null;
}

type ScoreKey = "mgmtCapitalAllocation" | "mgmtIncentives" | "mgmtExecution" | "brandPricingPower" | "brandLoyalty" | "brandTrust";

const SCORES: { group: string; items: { key: ScoreKey; label: string; hint: string }[] }[] = [
  {
    group: "Management",
    items: [
      { key: "mgmtCapitalAllocation", label: "Capital allocation", hint: "Reinvestment, buybacks, dividends and M&A at sensible prices" },
      { key: "mgmtIncentives", label: "Incentives & alignment", hint: "Insider ownership; pay tied to per-share value" },
      { key: "mgmtExecution", label: "Execution & candour", hint: "Delivers on plans; honest about mistakes" },
    ],
  },
  {
    group: "Brand",
    items: [
      { key: "brandPricingPower", label: "Pricing power", hint: "Can raise prices without losing customers" },
      { key: "brandLoyalty", label: "Customer loyalty", hint: "Repeat purchase, renewal, retention" },
      { key: "brandTrust", label: "Trust", hint: "Reputation with customers and regulators" },
    ],
  },
];

const VERDICTS = [
  { key: "PASS", label: "Pass", cls: "bg-success text-white border-success" },
  { key: "WATCH", label: "Watch", cls: "bg-warning text-white border-warning" },
  { key: "REJECT", label: "Reject", cls: "bg-danger text-white border-danger" },
];

/** Your own research record: verdict, scores and notes. */
export function NotesPanel({
  accountId,
  symbol,
  research,
  onSaved,
}: {
  accountId: string;
  symbol: string;
  research: Partial<ResearchRecord> | null;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<Partial<ResearchRecord>>(research ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof ResearchRecord>(key: K, value: ResearchRecord[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verdict: form.verdict ?? null,
        notes: form.notes ?? null,
        earningsNotes: form.earningsNotes ?? null,
        ...Object.fromEntries(SCORES.flatMap((g) => g.items).map(({ key }) => [key, form[key] ?? null])),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      onSaved?.();
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-card border border-border rounded-2xl shadow-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Your verdict</h3>
        <div className="flex gap-2">
          {VERDICTS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => set("verdict", form.verdict === v.key ? null : v.key)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                form.verdict === v.key ? v.cls : "border-border text-muted hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SCORES.map((g) => (
          <section key={g.group} className="bg-card border border-border rounded-2xl shadow-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">{g.group}</h3>
            {g.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">{item.label}</p>
                  <p className="text-[11px] text-muted">{item.hint}</p>
                </div>
                <div className="flex gap-1 shrink-0" role="radiogroup" aria-label={item.label}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={form[item.key] === n}
                      onClick={() => set(item.key, form[item.key] === n ? null : n)}
                      className={`w-7 h-7 rounded-lg text-xs font-semibold border transition-colors ${
                        (form[item.key] ?? 0) >= n ? "bg-accent text-white border-accent" : "border-border text-muted hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      <section className="bg-card border border-border rounded-2xl shadow-card p-5 space-y-3">
        <label className="block">
          <span className="text-sm font-semibold">Thesis & notes</span>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            rows={6}
            placeholder="Why you own it (or don't), what would change your mind…"
            className="mt-2 w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Earnings notes</span>
          <textarea
            value={form.earningsNotes ?? ""}
            onChange={(e) => set("earningsNotes", e.target.value)}
            rows={3}
            placeholder="Takeaways from the latest quarter"
            className="mt-2 w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </Button>
          {saved && <span className="text-xs text-success">Saved. The Analyst sees these too.</span>}
        </div>
      </section>
    </div>
  );
}
