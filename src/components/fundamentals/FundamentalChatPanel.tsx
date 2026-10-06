"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Loader2, Send } from "lucide-react";

interface ChatMessage {
  id?: string;
  role: string;
  content: string;
}

const SUGGESTED = [
  "Summarize the fundamentals",
  "Why are any ratios red?",
  "Is there value trap risk?",
  "Fit for a cash-secured put?",
];

export function FundamentalChatPanel({
  accountId,
  symbol,
  disabled,
  disabledReason,
}: {
  accountId: string;
  symbol: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch(
      `/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}/chat`
    );
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
  }, [accountId, symbol]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || disabled || loading) return;

    setLoading(true);
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "user", content: text.trim() }]);
    setInput("");
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(
        `/api/accounts/${accountId}/fundamentals/${encodeURIComponent(symbol)}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim() }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Chat failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: accumulated };
          }
          return next;
        });
      }

      await loadMessages();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chat failed";
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content) {
          next[next.length - 1] = { role: "assistant", content: `Error: ${msg}` };
        }
        return next;
      });
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[320px] border border-border rounded-xl bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">Fundamental AI</h3>
        <p className="text-xs text-muted mt-0.5">Educational only — not financial advice</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[480px]">
        {disabled && (
          <p className="text-sm text-muted text-center py-8">
            {disabledReason ?? "Fetch fundamentals first to enable chat."}
          </p>
        )}
        {!disabled && messages.length === 0 && (
          <p className="text-sm text-muted text-center py-4">
            Ask questions about {symbol}&apos;s fundamentals.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg px-3 py-2 max-w-[95%] ${
              m.role === "user"
                ? "ml-auto bg-accent/20 text-foreground"
                : "mr-auto bg-card-hover text-foreground"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {streaming && (
          <div className="flex items-center gap-2 text-muted text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!disabled && (
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex flex-wrap gap-1">
            {SUGGESTED.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendMessage(q)}
                disabled={loading}
                className="text-xs px-2 py-1 rounded-md bg-card-hover text-muted hover:text-foreground transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about fundamentals…"
              disabled={loading}
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <Button type="submit" size="sm" disabled={loading || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}