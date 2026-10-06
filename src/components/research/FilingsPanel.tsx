"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Loader2, Minus, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { FilingDigest } from "@/lib/sec/digest";
import type { RiskDiff } from "@/lib/sec/riskDiff";

interface FilingRow {
  accession: string;
  form: string;
  fiscalYear: number;
  periodEnd: string;
  filedAt: string;
  url: string;
  sectionLengths: Record<string, number>;
  riskHeadingCount: number;
  digest: FilingDigest | null;
}

interface FilingsResponse {
  companyName: string;
  filings: FilingRow[];
  riskChanges: { fiscalYear: number; vsYear: number; diff: RiskDiff }[];
}

const SECTIONS = [
  { key: "business", label: "Business" },
  { key: "riskFactors", label: "Risk Factors" },
  { key: "mdna", label: "MD&A" },
] as const;

const SEVERITY = { high: "bg-danger/12 text-danger", medium: "bg-warning/15 text-warning", low: "bg-border text-muted" } as const;

function DigestView({ d }: { d: FilingDigest }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="leading-relaxed">{d.businessSummary}</p>
      {d.segments.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-muted mb-1.5">Segments</p>
          <ul className="space-y-1">
            {d.segments.map((s, i) => (
              <li key={i}>
                <b>{s.name}</b>
                {s.share && <span className="text-muted"> · {s.share}</span>}
                <span className="text-muted"> · {s.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-muted mb-1.5">Competitive advantages</p>
          <ul className="space-y-1.5">
            {d.competitiveAdvantages.map((c, i) => (
              <li key={i}>
                {c.claim} <span className="text-muted text-xs">“{c.evidence}”</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-muted mb-1.5">Top risks</p>
          <ul className="space-y-1.5">
            {d.topRisks.map((r, i) => (
              <li key={i}>
                <span className={`rounded px-1 py-0.5 text-[10px] font-semibold mr-1.5 ${SEVERITY[r.severity]}`}>{r.severity}</span>
                <b className="font-medium">{r.title}</b> <span className="text-muted">{r.whyItMatters}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-muted mb-1.5">Capital allocation</p>
          <p className="text-muted leading-relaxed">{d.capitalAllocation}</p>
        </div>
        {d.notableChanges.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-muted mb-1.5">What&apos;s new this year</p>
            <ul className="space-y-1 list-disc pl-4 text-muted">
              {d.notableChanges.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {d.keyMetrics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {d.keyMetrics.map((m, i) => (
            <span key={i} className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
              <span className="text-muted">{m.name}:</span> <b className="num">{m.value}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The last 5 annual reports: AI digests, risk-factor changes and the original text. */
export function FilingsPanel({ accountId, symbol }: { accountId: string; symbol: string }) {
  const base = `/api/accounts/${accountId}/company/${encodeURIComponent(symbol)}/filings`;
  const [data, setData] = useState<FilingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [digesting, setDigesting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [reader, setReader] = useState<{ title: string; text: string | null; url: string } | null>(null);

  const apply = useCallback((ok: boolean, body: FilingsResponse & { error?: string }) => {
    if (ok) {
      setData(body);
      setOpen((o) => o ?? body.filings?.[0]?.accession ?? null);
      setError(null);
    } else setError(body.error ?? "Couldn't load filings");
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(base);
    apply(res.ok, await res.json().catch(() => ({})));
  }, [base, apply]);

  useEffect(() => {
    let live = true;
    fetch(base)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (live) apply(res.ok, body);
      })
      .catch(() => live && apply(false, {} as FilingsResponse));
    return () => {
      live = false;
    };
  }, [base, apply]);

  const digestAll = async () => {
    setDigesting(true);
    const res = await fetch(`${base}/digest`, { method: "POST" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Summarising failed");
    await load();
    setDigesting(false);
  };

  const readSection = async (f: FilingRow, key: string, label: string) => {
    setReader({ title: `${f.form} FY${f.fiscalYear} · ${label}`, text: null, url: f.url });
    const res = await fetch(`${base}/section?accession=${encodeURIComponent(f.accession)}&section=${key}`);
    const body = await res.json().catch(() => ({}));
    setReader({ title: `${f.form} FY${f.fiscalYear} · ${label}`, text: body.text ?? "Section not found in this filing.", url: f.url });
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-card p-8 flex items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Fetching {symbol}&apos;s annual reports from SEC EDGAR…
      </div>
    );
  }
  if (error && !data) return <div className="bg-card border border-border rounded-2xl shadow-card p-6 text-sm text-muted">{error}</div>;
  if (!data) return null;

  const missing = data.filings.filter((f) => !f.digest).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {data.companyName} · last {data.filings.length} annual reports ({data.filings[0]?.form}) from SEC EDGAR
        </p>
        {missing > 0 && (
          <Button size="sm" onClick={digestAll} disabled={digesting}>
            {digesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {digesting ? `Summarising ${missing}…` : `Summarise ${missing} report${missing > 1 ? "s" : ""} with AI`}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}

      {data.riskChanges.length > 0 && (
        <section className="bg-card border border-border rounded-2xl shadow-card p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">What changed in Risk Factors</h3>
            <p className="text-xs text-muted">New risks a company adds to its annual report are often an early warning.</p>
          </div>
          <div className="space-y-3">
            {data.riskChanges.map((c) => {
              const quiet = !c.diff.added.length && !c.diff.removed.length && !c.diff.reworded.length;
              return (
                <div key={c.fiscalYear} className="rounded-xl border border-border p-3">
                  <p className="text-xs font-semibold">
                    FY{c.fiscalYear} vs FY{c.vsYear}
                    <span className="font-normal text-muted">
                      {" "}
                      · {c.diff.added.length} new · {c.diff.removed.length} dropped · {c.diff.reworded.length} reworded · {c.diff.unchangedCount} unchanged
                    </span>
                  </p>
                  {quiet ? (
                    <p className="text-xs text-muted mt-1">No meaningful changes.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {c.diff.added.map((h, i) => (
                        <li key={`a${i}`} className="flex gap-2">
                          <Plus className="w-3.5 h-3.5 mt-0.5 shrink-0 text-danger" />
                          <span>
                            <span className="text-[10px] font-semibold uppercase text-danger mr-1">New</span>
                            {h.title}
                          </span>
                        </li>
                      ))}
                      {c.diff.removed.map((h, i) => (
                        <li key={`r${i}`} className="flex gap-2 text-muted">
                          <Minus className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>
                            <span className="text-[10px] font-semibold uppercase mr-1">Dropped</span>
                            {h.title}
                          </span>
                        </li>
                      ))}
                      {c.diff.reworded.map((h, i) => (
                        <li key={`w${i}`} className="flex gap-2 text-muted">
                          <span className="w-3.5 text-center shrink-0">~</span>
                          <span>
                            <span className="text-[10px] font-semibold uppercase mr-1">Reworded</span>
                            {h.to}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="space-y-3">
        {data.filings.map((f) => {
          const isOpen = open === f.accession;
          return (
            <section key={f.accession} className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : f.accession)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-card-hover transition-colors"
              >
                <FileText className="w-4 h-4 text-accent shrink-0" />
                <span className="font-semibold text-sm">
                  {f.form} · Fiscal {f.fiscalYear}
                </span>
                <span className="text-xs text-muted">filed {f.filedAt}</span>
                <span className="text-xs text-muted hidden sm:inline">· {f.riskHeadingCount} risk factors</span>
                <span className="ml-auto flex items-center gap-2">
                  {f.digest ? (
                    <span className="text-[10px] font-semibold text-success">Summarised</span>
                  ) : (
                    <span className="text-[10px] text-muted">Not summarised</span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
                  <div className="flex flex-wrap gap-2">
                    {SECTIONS.map((s) =>
                      f.sectionLengths[s.key] ? (
                        <Button key={s.key} size="sm" variant="secondary" onClick={() => readSection(f, s.key, s.label)}>
                          Read {s.label}
                        </Button>
                      ) : null
                    )}
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost">
                        Full filing on SEC <ExternalLink className="w-3 h-3" />
                      </Button>
                    </a>
                  </div>
                  {f.digest ? (
                    <DigestView d={f.digest} />
                  ) : (
                    <p className="text-sm text-muted">
                      Not summarised yet. Use “Summarise with AI” above, or generate a Company Report, which summarises all five.
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {reader && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setReader(null)}>
          <div className="w-full max-w-2xl h-full bg-card border-l border-border shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-border">
              <p className="text-sm font-semibold">{reader.title}</p>
              <div className="flex items-center gap-1">
                <a href={reader.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-muted hover:text-foreground" title="Open on SEC">
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button type="button" onClick={() => setReader(null)} className="p-1.5 rounded-lg text-muted hover:text-foreground" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {reader.text == null ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted mx-auto mt-10" />
              ) : (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{reader.text}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
