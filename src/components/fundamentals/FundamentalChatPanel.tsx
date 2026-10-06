"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, FileText, ListPlus, Loader2, RotateCcw, Sparkles, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "./Markdown";
import { ANALYST_NAME } from "@/lib/brand";
import { LensCards, LensPills } from "@/components/research/LensPills";
import { getBuiltinLens } from "@/lib/research/lenses";

interface ToolChip {
  id?: string;
  name: string;
  label: string;
  summary?: string;
  ok?: boolean;
  running?: boolean;
}

interface Proposal {
  symbol: string;
  verdict?: string | null;
  notes?: string | null;
  reason: string;
  status: "pending" | "saved" | "dismissed";
}

interface ReportCard {
  symbol: string;
  lensKey: string;
  lensName: string;
  verdict: string;
  score: number;
  moat: string;
  oneLine: string;
  greatestRisk: string | null;
}

const FIT_STYLE: Record<string, string> = {
  STRONG: "bg-success/12 text-success",
  PARTIAL: "bg-warning/15 text-warning",
  POOR: "bg-danger/12 text-danger",
};

interface ChatMessage {
  id?: string;
  role: string;
  content: string;
  lens?: string | null;
  tools?: ToolChip[];
  added?: string[];
  reports?: ReportCard[];
  proposal?: Proposal;
  error?: string;
}

const SYMBOL_SUGGESTIONS = [
  "Does this pass my criteria? What's holding it back?",
  "Build a DCF and challenge the growth assumption",
  "Is there value-trap risk here?",
  "Compare it to two close peers",
];


/**
 * Chat with Claude about fundamentals. With `symbol` it's scoped to that stock;
 * without it, it's the account-wide research desk (any ticker, watchlist, holdings, criteria).
 */
export function FundamentalChatPanel({
  accountId,
  symbol,
  variant = "panel",
  disabled,
  disabledReason,
  onResearchChange,
  onTurnEnd,
  onOwnStrategy,
  heightClass,
}: {
  accountId: string;
  symbol?: string;
  variant?: "panel" | "desk";
  disabled?: boolean;
  disabledReason?: string;
  /** Called after Claude saves a DCF or a research update is applied. */
  onResearchChange?: () => void;
  /** Called when a reply finishes (e.g. to refresh a watchlist Claude added to). */
  onTurnEnd?: () => void;
  /** Opens the custom-strategy builder (the "My strategy" pill / card). */
  onOwnStrategy?: () => void;
  /** Override the panel height (e.g. "h-full" inside a drawer). */
  heightClass?: string;
}) {
  const chatUrl = symbol
    ? `/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}/chat`
    : `/api/accounts/${accountId}/research-chat`;
  const desk = variant === "desk";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lens, setLens] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch(chatUrl);
    if (!res.ok) return;
    const data = await res.json();
    const loaded: ChatMessage[] = (data.messages ?? []).map(
      (m: { id: string; role: string; content: string; toolEvents?: ToolChip[] | null; lens?: string | null }) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        lens: m.lens ?? null,
        tools: m.toolEvents ?? undefined,
      })
    );
    setMessages(loaded);
    // Continue the conversation in the lens it was last using.
    const lastUser = [...loaded].reverse().find((m) => m.role === "user");
    if (lastUser) setLens(lastUser.lens ?? null);
  }, [chatUrl]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Grow the composer with its content, up to a cap.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });

  const sendMessage = async (text: string, lensOverride?: string | null) => {
    const message = text.trim();
    if (!message || disabled || busy) return;
    const turnLens = lensOverride === undefined ? lens : lensOverride;
    setBusy(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message, lens: turnLens },
      { role: "assistant", content: "", tools: [] },
    ]);
    let savedDcf = false;

    try {
      const res = await fetch(chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, lens: turnLens }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.t === "text") patchLast((m) => ({ ...m, content: m.content + e.d }));
          else if (e.t === "tool_start")
            patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), { id: e.id, name: e.name, label: e.label, running: true }] }));
          else if (e.t === "tool_end") {
            if (e.name === "run_dcf" && e.summary.includes("saved")) savedDcf = true;
            patchLast((m) => ({
              ...m,
              tools: (m.tools ?? []).map((t) => (t.id === e.id ? { ...t, running: false, ok: e.ok, summary: e.summary } : t)),
            }));
          } else if (e.t === "report") {
            const { t: _t, ...card } = e;
            void _t;
            patchLast((m) => ({ ...m, reports: [...(m.reports ?? []), card as ReportCard] }));
          } else if (e.t === "watchlist") patchLast((m) => ({ ...m, added: [...(m.added ?? []), e.symbol] }));
          else if (e.t === "proposal")
            patchLast((m) => ({
              ...m,
              proposal: { symbol: e.symbol, verdict: e.verdict, notes: e.notes, reason: e.reason, status: "pending" },
            }));
          else if (e.t === "error") patchLast((m) => ({ ...m, error: e.message }));
        }
      }
    } catch (err) {
      patchLast((m) => ({ ...m, error: err instanceof Error ? err.message : "Something went wrong" }));
    } finally {
      setBusy(false);
      if (savedDcf) onResearchChange?.();
      onTurnEnd?.();
      inputRef.current?.focus();
    }
  };

  const applyProposal = async (index: number) => {
    const p = messages[index].proposal;
    if (!p) return;
    const res = await fetch(`/api/accounts/${accountId}/fundamentals/${encodeURIComponent(p.symbol)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(p.verdict ? { verdict: p.verdict } : {}), ...(p.notes ? { notes: p.notes } : {}) }),
    });
    setMessages((prev) =>
      prev.map((m, i) => (i === index && m.proposal ? { ...m, proposal: { ...m.proposal, status: res.ok ? "saved" : "pending" } } : m))
    );
    if (res.ok) onResearchChange?.();
  };

  const dismissProposal = (index: number) =>
    setMessages((prev) => prev.map((m, i) => (i === index && m.proposal ? { ...m, proposal: { ...m.proposal, status: "dismissed" } } : m)));

  const clearThread = async () => {
    if (!confirm(symbol ? `Clear the ${symbol} research conversation?` : "Start a new research conversation?")) return;
    await fetch(chatUrl, { method: "DELETE" });
    setMessages([]);
  };

  const activeLens = getBuiltinLens(lens);
  const placeholder = disabled
    ? "Fundamentals still loading…"
    : activeLens
      ? `Ask with the ${activeLens.name} lens${symbol ? ` about ${symbol}` : ", e.g. “Research COST”"}…`
      : symbol
      ? `Ask about ${symbol}…`
      : "Ask the Analyst anything: a stock, your watchlist, your holdings, your criteria…";

  return (
    <div
      className={`flex flex-col bg-card border border-border rounded-2xl shadow-card overflow-hidden ${
        heightClass ?? (desk ? "h-[calc(100vh-10rem)] min-h-[560px]" : "h-[680px]")
      }`}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-speculation text-white">
            <Sparkles className="w-3.5 h-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">{ANALYST_NAME}</p>
            <p className="text-[11px] text-muted">
              {desk ? "Live fundamentals, your criteria, your holdings and DCF models" : `Researching ${symbol}`} · powered by Claude
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearThread}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-muted hover:text-foreground hover:bg-card-hover"
            title={symbol ? "Clear conversation" : "New conversation"}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {desk && "New chat"}
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className={`p-4 space-y-5 ${desk ? "max-w-3xl mx-auto w-full sm:p-6" : ""}`}>
          {disabled && disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
          {messages.length === 0 && !disabled && (desk ? (
            <div className="pt-6 sm:pt-12 space-y-6">
              <div className="text-center space-y-2">
                <span className="inline-grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-accent to-speculation text-white shadow-card">
                  <Sparkles className="w-5 h-5" />
                </span>
                <h2 className="text-xl font-semibold">What do you want to research?</h2>
                <p className="text-sm text-muted max-w-md mx-auto">
                  Pick an investor lens or just ask in plain English. The Analyst pulls live numbers, reads the
                  company&apos;s filings, builds DCFs and looks at what you hold. You&apos;ll see each step as it works.
                </p>
              </div>
              <LensCards
                onPick={(key, example) => {
                  setLens(key);
                  sendMessage(example, key);
                }}
                onOwnStrategy={onOwnStrategy}
              />
            </div>
          ) : (
            <div className="text-sm text-muted space-y-3">
              <p>
                Ask about <b className="text-foreground">{symbol}</b>. The Analyst pulls live fundamentals, checks them against your
                criteria, and can build and stress-test a DCF.
              </p>
              <div className="flex flex-wrap gap-2">
                {SYMBOL_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage(s)}
                    className="text-xs rounded-full border border-border px-3 py-1.5 text-left hover:border-accent/50 hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={m.id ?? i} className="flex flex-col items-end gap-1">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent text-white px-3.5 py-2 text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
                {getBuiltinLens(m.lens) && (
                  <span className="text-[10px] text-muted">{getBuiltinLens(m.lens)!.name} lens</span>
                )}
              </div>
            ) : (
              <div key={m.id ?? i} className="space-y-2">
                {m.tools && m.tools.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-xl border border-border/70 bg-background/60 px-3 py-2">
                    {m.tools.map((t, j) => (
                      <div key={t.id ?? j} className="slide-in flex items-center gap-2 text-[11px] text-muted min-w-0">
                        {t.running ? (
                          <Loader2 className="w-3 h-3 shrink-0 animate-spin text-accent" />
                        ) : t.ok === false ? (
                          <X className="w-3 h-3 shrink-0 text-danger" />
                        ) : (
                          <Wrench className="w-3 h-3 shrink-0 text-success" />
                        )}
                        <span className="text-foreground/80 shrink-0">{t.label}</span>
                        {t.summary && <span className="num truncate">· {t.summary}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {m.added && m.added.length > 0 && (
                  <p className="flex items-center gap-1.5 text-[11px] text-accent">
                    <ListPlus className="w-3.5 h-3.5" /> Added {m.added.join(", ")} to your watchlist
                  </p>
                )}
                {m.reports?.map((r) => (
                  <Link
                    key={`${r.symbol}-${r.lensKey}`}
                    href={`/accounts/${accountId}/fundamentals/${encodeURIComponent(r.symbol)}?lens=${encodeURIComponent(r.lensKey)}`}
                    className="block rounded-xl border border-border bg-background p-3 hover:border-accent/50 transition-colors slide-in"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-accent" />
                      <span className="text-sm font-semibold">{r.symbol} · {r.lensName} report</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${FIT_STYLE[r.verdict] ?? ""}`}>
                        {r.verdict.toLowerCase()} fit {r.score}/100
                      </span>
                      <span className="text-[10px] text-muted">{r.moat === "NONE" ? "no moat" : `${r.moat.toLowerCase()} moat`}</span>
                    </div>
                    <p className="text-sm mt-1.5">{r.oneLine}</p>
                    {r.greatestRisk && <p className="text-xs text-muted mt-1">Greatest risk: {r.greatestRisk}</p>}
                    <p className="text-xs text-accent mt-1.5">Open full report →</p>
                  </Link>
                ))}
                {m.content ? (
                  <Markdown text={m.content} />
                ) : busy && i === messages.length - 1 && !m.error ? (
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
                  </p>
                ) : null}
                {m.error && <p className="text-xs text-danger">{m.error}</p>}
                {m.proposal && m.proposal.status !== "dismissed" && (
                  <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-accent">
                      Proposed {m.proposal.symbol} research update
                    </p>
                    {m.proposal.verdict && (
                      <p>
                        Verdict: <b>{m.proposal.verdict}</b>
                      </p>
                    )}
                    {m.proposal.notes && <p className="whitespace-pre-wrap text-muted">{m.proposal.notes}</p>}
                    <p className="text-xs text-muted">{m.proposal.reason}</p>
                    {m.proposal.status === "saved" ? (
                      <p className="flex items-center gap-1 text-xs text-success">
                        <Check className="w-3.5 h-3.5" /> Saved to your research
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => applyProposal(i)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => dismissProposal(i)}>
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="p-3 border-t border-border space-y-2"
      >
        <div className={desk ? "max-w-3xl mx-auto" : ""}>
          <LensPills value={lens} onChange={setLens} onOwnStrategy={onOwnStrategy} disabled={busy} />
        </div>
        <div
          className={`flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-accent/40 ${
            desk ? "max-w-3xl mx-auto" : ""
          }`}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder={placeholder}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed focus:outline-none disabled:opacity-60"
            disabled={disabled || busy}
            autoFocus={desk}
          />
          <button
            type="submit"
            disabled={disabled || busy || !input.trim()}
            className="grid place-items-center w-8 h-8 shrink-0 rounded-xl bg-accent text-white transition-opacity disabled:opacity-35"
            aria-label="Send"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
        {desk && <p className="text-[10px] text-muted text-center mt-1.5">Enter to send · Shift+Enter for a new line · Educational, not advice</p>}
      </form>
    </div>
  );
}
