"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Filter, ListPlus, Loader2, Play, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CriteriaTable } from "@/components/fundamentals/CriteriaEditor";
import { FILTER_GROUPS, FILTERS, filterIdFor } from "@/lib/finviz/filters";
import { BUILTIN_LENS_KEYS, LENSES, type BuiltinLensKey } from "@/lib/research/lenses";
import { DEFAULT_PROFILE, type CriteriaProfile } from "@/lib/fundamentals/criteria";
import { LENS_STYLE } from "./LensPills";
import { FinvizConnect } from "./FinvizConnect";
import { scoreColor } from "./ScoreCard";

interface Strategy {
  id?: string;
  name: string;
  baseLens: BuiltinLensKey | null;
  finvizFilters: string[];
  criteria: CriteriaProfile;
  questions: string[];
}

interface ScreenRow {
  symbol: string;
  company: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  price: number | null;
  metrics: Record<string, number | null>;
  onWatchlist: boolean;
  quickScore: number | null;
  scoreCaps: string[];
}

type Progress = { symbol: string; status: "queued" | "running" | "done" | "error"; stage?: string; verdict?: string; score?: number };

const SORT_OPTIONS: Record<string, string> = {
  score: "Score (best first)",
  "-marketcap": "Market cap",
  pe: "P/E (low)",
  peg: "PEG (low)",
  "-roe": "ROE (high)",
  "-epsgrowth5years": "EPS growth 5y",
  "-perf52w": "1-yr performance",
};

const fromLens = (key: BuiltinLensKey): Strategy => ({
  name: `${LENSES[key].name}-style`,
  baseLens: key,
  finvizFilters: [...LENSES[key].finvizFilters],
  criteria: LENSES[key].criteria,
  questions: [],
});

const BLANK: Strategy = { name: "New strategy", baseLens: null, finvizFilters: ["cap_midover"], criteria: DEFAULT_PROFILE, questions: [] };

const fmtCap = (m: number | null) => (m == null ? "—" : m >= 1e6 ? `$${(m / 1e6).toFixed(2)}T` : m >= 1e3 ? `$${(m / 1e3).toFixed(1)}B` : `$${m.toFixed(0)}M`);
const fmtNum = (v: number | null | undefined, suffix = "") => (v == null ? "—" : `${v.toFixed(v >= 100 ? 0 : 1)}${suffix}`);

/** Build a strategy (Finviz filters + scoring + questions), screen with Finviz Elite, research the results. */
export function ScreenerPanel({ accountId }: { accountId: string }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  // Set when we couldn't even check the Finviz connection (server error), so we say so instead of guessing.
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saved, setSaved] = useState<(Strategy & { id: string })[]>([]);
  const [current, setCurrent] = useState<Strategy>(fromLens("buffett"));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<"filters" | "scoring" | "questions">("filters");
  const [sort, setSort] = useState("score");
  const [rows, setRows] = useState<ScreenRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [newQuestion, setNewQuestion] = useState("");

  useEffect(() => {
    let live = true;
    const read = async (url: string) => {
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      return body;
    };
    read(`/api/accounts/${accountId}/screener`)
      .then((screener) => {
        if (!live) return;
        setConnected(Boolean(screener.connected));
        setStatusError(null);
      })
      .catch((err: Error) => {
        if (!live) return;
        setConnected(null);
        setStatusError(err.message);
      });
    read("/api/research-strategies")
      .then((d) => live && setSaved(d.strategies ?? []))
      .catch((err: Error) => live && setError(`Couldn't load your saved strategies: ${err.message}`));
    return () => {
      live = false;
    };
  }, [accountId]);

  const edit = (patch: Partial<Strategy>) => {
    setCurrent((c) => ({ ...c, ...patch }));
    setDirty(true);
  };

  const setFilter = (filterId: string, code: string) => {
    const rest = current.finvizFilters.filter((c) => filterIdFor(c) !== filterId);
    edit({ finvizFilters: code ? [...rest, code] : rest });
  };

  const activeByFilter = useMemo(() => new Map(current.finvizFilters.map((c) => [filterIdFor(c), c])), [current.finvizFilters]);

  const pick = (value: string) => {
    if (value.startsWith("lens:")) setCurrent(fromLens(value.slice(5) as BuiltinLensKey));
    else if (value === "blank") setCurrent(BLANK);
    else {
      const s = saved.find((x) => x.id === value);
      if (s) setCurrent(s);
    }
    setDirty(false);
    setRows(null);
    setSelected(new Set());
    setProgress([]);
  };

  const save = async (asNew = false) => {
    setSaving(true);
    setError(null);
    const body = JSON.stringify({
      name: current.name,
      baseLens: current.baseLens,
      finvizFilters: current.finvizFilters,
      criteria: current.criteria,
      questions: current.questions,
    });
    const res = current.id && !asNew
      ? await fetch(`/api/research-strategies/${current.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body })
      : await fetch("/api/research-strategies", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't save the strategy");
      return null;
    }
    const s = data.strategy as Strategy & { id: string };
    setSaved((list) => (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s]));
    setCurrent(s);
    setDirty(false);
    return s;
  };

  const remove = async () => {
    if (!current.id || !confirm(`Delete “${current.name}”?`)) return;
    await fetch(`/api/research-strategies/${current.id}`, { method: "DELETE" });
    setSaved((list) => list.filter((x) => x.id !== current.id));
    pick("lens:buffett");
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    setSelected(new Set());
    const res = await fetch(`/api/accounts/${accountId}/screener`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // "score" is sorted here; Finviz returns its default (market cap) order.
      body: JSON.stringify({
        filters: current.finvizFilters,
        sort: sort === "score" ? "-marketcap" : sort,
        criteria: current.criteria,
        baseLens: current.baseLens,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setRunning(false);
    if (!res.ok) {
      setError(data.error ?? "Screen failed");
      return;
    }
    setRows(sort === "score" ? [...data.rows].sort((a: ScreenRow, b: ScreenRow) => (b.quickScore ?? -1) - (a.quickScore ?? -1)) : data.rows);
    setTotal(data.total);
  };

  const toggle = (symbol: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  const addToWatchlist = async () => {
    const symbols = [...selected];
    const res = await fetch(`/api/accounts/${accountId}/screener/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols, strategyName: current.name }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice(`Added ${data.added} to your watchlist${data.alreadyListed ? ` (${data.alreadyListed} already there)` : ""}.`);
      setRows((r) => r?.map((row) => (selected.has(row.symbol) ? { ...row, onWatchlist: true } : row)) ?? r);
    } else setError(data.error ?? "Couldn't add to watchlist");
  };

  const lensKeyForResearch = () => (current.id && !dirty ? `strategy:${current.id}` : current.baseLens ?? "none");

  const research = async () => {
    const symbols = [...selected].slice(0, 5);
    if (!symbols.length) return;
    let lensKey = lensKeyForResearch();
    if (current.questions.length && (!current.id || dirty)) {
      if (!confirm("Save this strategy first so the reports include your own questions?")) return;
      const s = await save();
      if (!s) return;
      lensKey = `strategy:${s.id}`;
    }
    if (!confirm(`Write ${symbols.length} Company Report${symbols.length > 1 ? "s" : ""} with “${current.name}”? Each takes 1–2 minutes and uses AI credits.`)) return;

    setProgress(symbols.map((symbol) => ({ symbol, status: "queued" })));
    const patch = (symbol: string, p: Partial<Progress>) => setProgress((list) => list.map((x) => (x.symbol === symbol ? { ...x, ...p } : x)));
    const reportUrl = (symbol: string) => `/api/accounts/${accountId}/company/${encodeURIComponent(symbol)}/report`;

    // Start every report as a background job (they keep running if you leave), then poll.
    const pending = new Set<string>();
    for (const symbol of symbols) {
      const res = await fetch(reportUrl(symbol), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lens: lensKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        pending.add(symbol);
        patch(symbol, { status: "running", stage: "Queued" });
      } else patch(symbol, { status: "error", stage: body.error ?? "Couldn't start" });
    }
    while (pending.size) {
      await new Promise((r) => setTimeout(r, 3000));
      await Promise.all(
        [...pending].map(async (symbol) => {
          const res = await fetch(`${reportUrl(symbol)}?lens=${encodeURIComponent(lensKey)}`);
          if (!res.ok) return;
          const d = await res.json();
          if (d.job?.status === "RUNNING") patch(symbol, { stage: d.job.stages.at(-1) ?? "Working" });
          else if (d.job?.status === "ERROR") {
            pending.delete(symbol);
            patch(symbol, { status: "error", stage: d.job.error ?? "Failed" });
          } else if (d.report) {
            pending.delete(symbol);
            patch(symbol, { status: "done", verdict: d.report.report.lensFit.verdict, score: d.report.report.lensFit.score });
          }
        })
      );
    }
  };

  const baseStyle = current.baseLens ? LENS_STYLE[current.baseLens] : null;
  // Why "Run screen" is disabled, in words, shown next to the button.
  const runBlocker = statusError
    ? `Can't check your Finviz connection: ${statusError}`
    : connected === null
      ? "Checking your Finviz connection…"
      : connected === false
        ? "To run screens, connect your Finviz Elite account (see Results →)."
        : current.finvizFilters.length === 0
          ? "No filters set, so this screens the whole market (first 200 shown)."
          : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] gap-4 items-start">
      {/* Strategy builder */}
      <aside className="bg-card border border-border rounded-2xl shadow-card overflow-hidden lg:sticky lg:top-4">
        <div className="px-4 py-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Filter className="w-4 h-4 text-accent" /> Strategy
            </h2>
            <select
              value={current.id ?? ""}
              onChange={(e) => pick(e.target.value)}
              className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 max-w-[60%]"
              aria-label="Load a strategy or template"
            >
              <option value="" disabled>
                {current.id ? "" : "Start from…"}
              </option>
              <optgroup label="Templates">
                {BUILTIN_LENS_KEYS.map((k) => (
                  <option key={k} value={`lens:${k}`}>
                    {LENSES[k].name}-style
                  </option>
                ))}
                <option value="blank">Blank</option>
              </optgroup>
              {saved.length > 0 && (
                <optgroup label="Your strategies">
                  {saved.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <input
            value={current.name}
            onChange={(e) => edit({ name: e.target.value })}
            className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/40"
            aria-label="Strategy name"
          />
          {current.baseLens && (
            <p className={`text-[11px] ${baseStyle?.text ?? ""}`}>
              Thinks like the {LENSES[current.baseLens].name} lens · {LENSES[current.baseLens].tagline}
            </p>
          )}
          <div className="flex gap-1 rounded-lg bg-background border border-border p-0.5">
            {(["filters", "scoring", "questions"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${section === s ? "bg-card shadow-card text-foreground" : "text-muted"}`}
              >
                {s === "filters" ? `Filters (${current.finvizFilters.length})` : s === "scoring" ? "Scoring" : `Questions (${current.questions.length})`}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[calc(100vh-22rem)] overflow-y-auto">
          {section === "filters" && (
            <div className="divide-y divide-border">
              {FILTER_GROUPS.map((group) => {
                const defs = FILTERS.filter((f) => f.group === group);
                const active = defs.filter((f) => activeByFilter.has(f.id)).length;
                return (
                  <details key={group} open={active > 0 || group === "Descriptive"} className="group">
                    <summary className="flex items-center justify-between px-4 py-2 text-xs font-semibold cursor-pointer select-none list-none">
                      <span>
                        {group} {active > 0 && <span className="text-accent">· {active}</span>}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-4 pb-3 space-y-1.5">
                      {defs.map((f) => (
                        <label key={f.id} className="flex items-center justify-between gap-2 text-xs" title={f.hint}>
                          <span className={activeByFilter.has(f.id) ? "text-foreground font-medium" : "text-muted"}>{f.label}</span>
                          <select
                            value={activeByFilter.get(f.id) ?? ""}
                            onChange={(e) => setFilter(f.id, e.target.value)}
                            className={`w-40 bg-background border rounded-lg px-2 py-1 ${activeByFilter.has(f.id) ? "border-accent/50" : "border-border"}`}
                          >
                            <option value="">Any</option>
                            {f.options.map((o) => (
                              <option key={o.code} value={o.code}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
          {section === "scoring" && (
            <div className="space-y-2">
              <p className="px-4 pt-3 text-[11px] text-muted">How the Analyst scores each stock under this strategy.</p>
              <CriteriaTable profile={current.criteria} onChange={(criteria) => edit({ criteria })} />
              <label className="flex items-center gap-2 px-4 pb-3 text-xs">
                Pass at
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={current.criteria.passScore}
                  onChange={(e) => edit({ criteria: { ...current.criteria, passScore: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) } })}
                  className="num w-14 px-2 py-1 bg-background border border-border rounded-lg text-right"
                />
                / 100
              </label>
            </div>
          )}
          {section === "questions" && (
            <div className="p-4 space-y-2">
              <p className="text-[11px] text-muted">
                Every report under this strategy answers these, on top of the standard ones (competitive advantage, moat, greatest risk).
              </p>
              {current.questions.map((q, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <span className="flex-1">{q}</span>
                  <button
                    type="button"
                    onClick={() => edit({ questions: current.questions.filter((_, j) => j !== i) })}
                    className="text-muted hover:text-danger"
                    aria-label="Remove question"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = newQuestion.trim();
                  if (q.length < 3 || current.questions.length >= 12) return;
                  edit({ questions: [...current.questions, q] });
                  setNewQuestion("");
                }}
              >
                <input
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="e.g. Is the dividend growing and covered by free cash flow?"
                  className="flex-1 min-w-0 px-3 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <Button type="submit" size="sm" disabled={newQuestion.trim().length < 3} aria-label="Add question">
                  <Plus className="w-4 h-4" />
                </Button>
              </form>
            </div>
          )}
        </div>

        {runBlocker && (
          <p className={`px-4 pt-3 text-[11px] border-t border-border ${statusError ? "text-danger" : "text-muted"}`}>{runBlocker}</p>
        )}
        <div className={`px-4 py-3 flex flex-wrap items-center gap-2 ${runBlocker ? "" : "border-t border-border"}`}>
          <Button size="sm" onClick={run} disabled={running || connected !== true} title={runBlocker ?? undefined}>
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run screen
          </Button>
          <Button size="sm" variant="secondary" onClick={() => save(false)} disabled={saving || (!dirty && Boolean(current.id))}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {current.id ? (dirty ? "Save" : "Saved") : "Save"}
          </Button>
          {current.id && (
            <>
              <Button size="sm" variant="ghost" onClick={() => save(true)} disabled={saving}>
                Save as new
              </Button>
              <button type="button" onClick={remove} className="ml-auto p-1.5 text-muted hover:text-danger" aria-label="Delete strategy">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Results */}
      <section className="bg-card border border-border rounded-2xl shadow-card overflow-hidden min-h-[320px]">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Results</h2>
            <p className="text-[11px] text-muted">
              {rows ? `${total} match${total === 1 ? "" : "es"}${total > rows.length ? `, showing ${rows.length}` : ""} · Finviz Elite` : "Run the screen to see matches"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="text-xs bg-background border border-border rounded-lg px-2 py-1.5" aria-label="Sort results">
              {Object.entries(SORT_OPTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  Sort: {v}
                </option>
              ))}
            </select>
            {selected.size > 0 && (
              <>
                <Button size="sm" variant="secondary" onClick={addToWatchlist}>
                  <ListPlus className="w-3.5 h-3.5" /> Add {selected.size} to watchlist
                </Button>
                <Button size="sm" onClick={research} disabled={progress.some((p) => p.status === "running")}>
                  <Sparkles className="w-3.5 h-3.5" /> Research {Math.min(selected.size, 5)} with this strategy
                </Button>
              </>
            )}
          </div>
        </div>

        {statusError && (
          <div className="m-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            Couldn&apos;t reach the screener: {statusError}
          </div>
        )}
        {connected === false && (
          <div className="m-4 space-y-2">
            <FinvizConnect compact onChange={setConnected} />
            <p className="text-[11px] text-muted px-1">You can build and save strategies without it; running screens needs Finviz Elite.</p>
          </div>
        )}
        {error && <p className="px-4 pt-3 text-xs text-danger">{error}</p>}
        {notice && <p className="px-4 pt-3 text-xs text-success">{notice}</p>}

        {progress.length > 0 && (
          <div className="m-4 rounded-xl border border-border bg-background p-3 space-y-1.5">
            <p className="text-xs font-semibold">Company Reports · {current.name}</p>
            {progress.map((p) => (
              <div key={p.symbol} className="flex items-center gap-2 text-xs">
                {p.status === "running" ? (
                  <Loader2 className="w-3 h-3 animate-spin text-accent" />
                ) : p.status === "done" ? (
                  <Check className="w-3 h-3 text-success" />
                ) : p.status === "error" ? (
                  <X className="w-3 h-3 text-danger" />
                ) : (
                  <span className="w-3 h-3 rounded-full border border-border" />
                )}
                <b className="w-14">{p.symbol}</b>
                {p.status === "done" ? (
                  <Link
                    href={`/accounts/${accountId}/fundamentals/${encodeURIComponent(p.symbol)}?lens=${encodeURIComponent(lensKeyForResearch())}`}
                    className="text-accent hover:underline"
                  >
                    {p.verdict?.toLowerCase()} fit {p.score}/100 · open report →
                  </Link>
                ) : (
                  <span className={p.status === "error" ? "text-danger" : "text-muted"}>{p.stage ?? "Waiting"}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {rows && rows.length === 0 && <p className="p-8 text-center text-sm text-muted">No stocks match. Loosen a filter or two.</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted text-left">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selected.size > 0 && selected.size === rows.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.symbol)) : new Set())}
                      className="accent-[var(--accent)]"
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Stock</th>
                  <th className="px-2 py-2 font-medium text-right" title="Quick WealthOS Score from Finviz metrics, using this strategy's thresholds and lens weights">
                    Score
                  </th>
                  <th className="px-2 py-2 font-medium hidden md:table-cell">Sector</th>
                  <th className="px-2 py-2 font-medium text-right">Mkt cap</th>
                  <th className="px-2 py-2 font-medium text-right">P/E</th>
                  <th className="px-2 py-2 font-medium text-right">PEG</th>
                  <th className="px-2 py-2 font-medium text-right">ROE</th>
                  <th className="px-2 py-2 font-medium text-right hidden sm:table-cell">D/E</th>
                  <th className="px-2 py-2 font-medium text-right hidden sm:table-cell">EPS 5y</th>
                  <th className="px-3 py-2 font-medium text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} className={`border-b border-border/40 hover:bg-card-hover/60 ${selected.has(r.symbol) ? "bg-accent/5" : ""}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(r.symbol)} onChange={() => toggle(r.symbol)} aria-label={`Select ${r.symbol}`} className="accent-[var(--accent)]" />
                    </td>
                    <td className="px-2 py-2">
                      <Link href={`/accounts/${accountId}/fundamentals/${encodeURIComponent(r.symbol)}`} className="font-semibold hover:text-accent">
                        {r.symbol}
                      </Link>
                      {r.onWatchlist && <span className="ml-1.5 text-[9px] uppercase tracking-wide text-accent">listed</span>}
                      <span className="block text-[11px] text-muted truncate max-w-[220px]">{r.company}</span>
                    </td>
                    <td className="px-2 py-2 text-right num font-semibold" title={r.scoreCaps.join("; ") || "Quick score from Finviz metrics"}>
                      <span style={{ color: scoreColor(r.quickScore) }}>{r.quickScore ?? "—"}</span>
                    </td>
                    <td className="px-2 py-2 text-muted hidden md:table-cell">{r.sector}</td>
                    <td className="px-2 py-2 text-right num">{fmtCap(r.marketCap)}</td>
                    <td className="px-2 py-2 text-right num">{fmtNum(r.metrics.pe)}</td>
                    <td className="px-2 py-2 text-right num">{fmtNum(r.metrics.peg)}</td>
                    <td className="px-2 py-2 text-right num">{fmtNum(r.metrics.roe, "%")}</td>
                    <td className="px-2 py-2 text-right num hidden sm:table-cell">{fmtNum(r.metrics.debtToEquity)}</td>
                    <td className="px-2 py-2 text-right num hidden sm:table-cell">{fmtNum(r.metrics.epsGrowth5y, "%")}</td>
                    <td className="px-3 py-2 text-right num">{r.price != null ? `$${r.price.toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!rows && connected !== false && (
          <div className="p-10 text-center text-sm text-muted space-y-1">
            <Filter className="w-6 h-6 mx-auto opacity-60" />
            <p>Pick a template or your own strategy, adjust the filters, then run the screen.</p>
          </div>
        )}
      </section>
    </div>
  );
}
