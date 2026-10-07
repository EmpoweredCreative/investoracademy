"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, Loader2, Paperclip, RotateCcw, Sparkles, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/fundamentals/Markdown";
import { ACTION_TARGET, type Proposal } from "@/lib/foundation/proposals";

interface ToolChip {
  id?: string;
  name: string;
  label: string;
  summary?: string;
  ok?: boolean;
  running?: boolean;
}

interface Card extends Proposal {
  status: "pending" | "saving" | "saved" | "dismissed" | "failed";
  error?: string;
}

interface ChatMessage {
  id?: string;
  role: string;
  kind?: string;
  content: string;
  tools?: ToolChip[];
  proposals?: Card[];
  error?: string;
}

interface Allowance {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  intro: boolean;
}

interface State {
  configured: boolean;
  ownKey: { connected: boolean; hint: string | null };
  allowance: Allowance;
  messages: { id: string; role: string; kind: string; content: string; toolEvents: ToolChip[] | null }[];
}

const SUGGESTIONS = [
  "Help me get my numbers set up",
  "What's my fastest path to being debt-free?",
  "Could I afford a $400,000 house?",
  "How big should my emergency fund be, and how fast can I get there?",
  "Should I pay off debt or invest extra cash?",
];
const BUSINESS_SUGGESTION = "What can my business afford to pay me?";

/** Chat with the Foundation advisor. Proposed record changes show as cards to confirm. */
export function AdvisorChat({ hasBusiness, onRecordsChanged }: { hasBusiness: boolean; onRecordsChanged: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/foundation/advisor")
      .then((r) => r.json())
      .then((s: State) => {
        setState(s);
        setMessages(s.messages.map((m) => ({ id: m.id, role: m.role, kind: m.kind, content: m.content, tools: m.toolEvents ?? undefined })));
      })
      .catch(() => setNotice("Couldn't load the advisor."));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });

  const setRemaining = (remaining: number | null, limit: number | null) =>
    setState((s) => (s && remaining != null && limit != null ? { ...s, allowance: { ...s.allowance, remaining, limit, used: limit - remaining } } : s));

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setInput("");
    setNotice(null);
    setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "", tools: [] }]);
    try {
      const res = await fetch("/api/foundation/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
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
          else if (e.t === "tool_start") patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), { id: e.id, name: e.name, label: e.label, running: true }] }));
          else if (e.t === "tool_end")
            patchLast((m) => ({ ...m, tools: (m.tools ?? []).map((t) => (t.id === e.id ? { ...t, running: false, ok: e.ok, summary: e.summary } : t)) }));
          else if (e.t === "proposal") patchLast((m) => ({ ...m, proposals: [...(m.proposals ?? []), { ...e.proposal, status: "pending" }] }));
          else if (e.t === "allowance") setRemaining(e.remaining, e.limit);
          else if (e.t === "error") patchLast((m) => ({ ...m, error: e.message }));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      // Nothing was sent to the advisor: take the turn back out and show why.
      setMessages((prev) => prev.slice(0, -2));
      setInput(message);
      setNotice(msg);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setMessages((prev) => [...prev, { role: "user", kind: "statement", content: `Uploaded a statement (${file.name})` }, { role: "assistant", content: "", tools: [{ name: "read_statement", label: "Reading your statement", running: true }] }]);
    try {
      const form = new FormData();
      form.append("statement", file);
      const res = await fetch("/api/foundation/advisor/statement", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that statement.");
      patchLast((m) => ({
        ...m,
        content: data.text,
        tools: [{ name: "read_statement", label: "Read your statement", ok: true }],
        proposals: (data.proposals as Proposal[]).map((p) => ({ ...p, status: "pending" as const })),
      }));
      if (data.allowance) setRemaining(data.allowance.remaining, data.allowance.limit);
    } catch (err) {
      patchLast((m) => ({ ...m, tools: [{ name: "read_statement", label: "Reading your statement", ok: false }], error: err instanceof Error ? err.message : "Upload failed" }));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const setCard = (mi: number, ci: number, patch: Partial<Card>) =>
    setMessages((prev) =>
      prev.map((m, i) => (i === mi && m.proposals ? { ...m, proposals: m.proposals.map((c, j) => (j === ci ? { ...c, ...patch } : c)) } : m))
    );

  const applyCard = async (mi: number, ci: number) => {
    const card = messages[mi].proposals?.[ci];
    if (!card) return;
    const target = ACTION_TARGET[card.action];
    setCard(mi, ci, { status: "saving", error: undefined });
    const res = await fetch(target.create ? `/api/foundation/${target.resource}` : `/api/foundation/${target.resource}/${card.id}`, {
      method: target.create ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card.fields),
    });
    if (res.ok) {
      setCard(mi, ci, { status: "saved" });
      onRecordsChanged();
    } else {
      const data = await res.json().catch(() => ({}));
      setCard(mi, ci, { status: "failed", error: data.error ?? "Couldn't save" });
    }
  };

  const startOver = async () => {
    if (!confirm("Start a new conversation? Your saved numbers stay as they are.")) return;
    await fetch("/api/foundation/advisor", { method: "DELETE" });
    setMessages([]);
  };

  if (!state) return <div className="h-64 rounded-2xl bg-card border border-border animate-pulse" />;

  const a = state.allowance;
  const blocked = !state.ownKey.connected && (!state.configured || a.remaining <= 0);
  const suggestions = hasBusiness ? [SUGGESTIONS[0], BUSINESS_SUGGESTION, ...SUGGESTIONS.slice(1, 4)] : SUGGESTIONS;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card flex flex-col min-h-[560px]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border text-xs">
        <Sparkles className="w-4 h-4 text-accent" />
        <span className="font-semibold text-sm">AI financial advisor</span>
        <span className="ml-auto text-muted">
          {state.ownKey.connected ? (
            <>Using your own API key ····{state.ownKey.hint}</>
          ) : (
            <>
              <span className={a.remaining <= 3 ? "text-warning font-semibold" : "font-semibold text-foreground"}>{a.remaining}</span> of {a.limit}{" "}
              messages left {a.intro ? "in your first month" : "this month"}
            </>
          )}
        </span>
        {messages.length > 0 && (
          <button type="button" onClick={startOver} className="inline-flex items-center gap-1 text-muted hover:text-foreground" title="Start over">
            <RotateCcw className="w-3.5 h-3.5" />
            New
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-h-[65vh]">
        {messages.length === 0 && (
          <div className="py-6 space-y-4">
            <p className="text-sm text-muted max-w-xl">
              Ask anything about your money. I can see the numbers you&apos;ve entered in Foundation, run payoff, mortgage and
              savings scenarios, and suggest updates for you to confirm. You can also attach a statement and I&apos;ll read the
              balance for you.
            </p>
            <div className={`flex flex-wrap gap-2 ${blocked ? "hidden" : ""}`}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={blocked || busy}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-card-hover hover:border-accent/40 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, mi) =>
          m.role === "user" ? (
            <div key={m.id ?? mi} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent text-white px-3.5 py-2 text-sm whitespace-pre-wrap">
                {m.kind === "statement" && <Paperclip className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id ?? mi} className="space-y-2 max-w-[92%]">
              {m.tools && m.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.tools.map((t, i) => (
                    <span
                      key={t.id ?? i}
                      title={t.summary}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                        t.ok === false ? "border-danger/30 text-danger" : "border-border text-muted"
                      }`}
                    >
                      {t.running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
              {m.content ? (
                <div className="text-sm">
                  <Markdown text={m.content} />
                </div>
              ) : (
                busy && mi === messages.length - 1 && !m.error && <Loader2 className="w-4 h-4 animate-spin text-muted" />
              )}
              {m.proposals?.map((c, ci) => (
                <div key={ci} className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm">
                  <div className="font-semibold">{c.label}</div>
                  <div className="text-xs text-muted mt-0.5">{c.reason}</div>
                  <div className="mt-2 flex items-center gap-2">
                    {c.status === "saved" ? (
                      <span className="inline-flex items-center gap-1 text-success text-xs font-medium">
                        <Check className="w-3.5 h-3.5" /> Saved
                      </span>
                    ) : c.status === "dismissed" ? (
                      <span className="text-xs text-muted">Dismissed</span>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => applyCard(mi, ci)} loading={c.status === "saving"}>
                          <Check className="w-3.5 h-3.5" />
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setCard(mi, ci, { status: "dismissed" })}>
                          <X className="w-3.5 h-3.5" />
                          Dismiss
                        </Button>
                        {c.error && <span className="text-xs text-danger">{c.error}</span>}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {m.error && <p className="text-sm text-danger">{m.error}</p>}
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      {notice && <p className="px-4 pb-2 text-sm text-danger">{notice}</p>}
      {blocked ? (
        <div className="border-t border-border px-4 py-3 text-sm">
          {!state.configured ? (
            "The advisor isn't set up on this server yet."
          ) : (
            <>
              You&apos;ve used your {a.limit} included messages {a.intro ? "for your first month" : "for this month"}. They reset{" "}
              {new Date(a.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.{" "}
              <Link href="/settings#claude-key" className="text-accent underline">
                Add your own API key
              </Link>{" "}
              to keep going on your own account.
            </>
          )}
        </div>
      ) : (
        <form
          className="border-t border-border p-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-card-hover"
            title="Attach a statement (PNG, JPG or PDF). It's read once and not stored."
            aria-label="Attach a statement"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about your money, or tell me what changed…"
            className="flex-1 resize-none max-h-40 px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          <Button type="submit" disabled={busy || !input.trim()} aria-label="Send">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </Button>
        </form>
      )}
    </div>
  );
}
