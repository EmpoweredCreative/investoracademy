"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Status {
  connected: boolean;
  hint: string | null;
  verifiedAt: string | null;
}

/**
 * Connect the user's own Finviz Elite account. The token is verified against
 * Finviz, then stored encrypted; the browser only ever sees its last 4 characters.
 */
export function FinvizConnect({ compact, onChange }: { compact?: boolean; onChange?: (connected: boolean) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/integrations/finviz")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok) setStatus(body);
        else setError(body.error ?? `Couldn't check the Finviz connection (${r.status})`);
      })
      .catch(() => live && setError("Couldn't reach the server to check the Finviz connection."));
    return () => {
      live = false;
    };
  }, []);

  const connect = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/integrations/finviz", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't connect Finviz");
      return;
    }
    setStatus(data);
    setToken("");
    setEditing(false);
    onChange?.(true);
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Finviz? The screener will stop working until you reconnect.")) return;
    await fetch("/api/integrations/finviz", { method: "DELETE" });
    setStatus({ connected: false, hint: null, verifiedAt: null });
    onChange?.(false);
  };

  if (!status) {
    return error ? (
      <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-xs text-danger">{error}</p>
    ) : (
      <div className="h-12 rounded-xl bg-background animate-pulse" />
    );
  }

  if (status.connected && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="grid place-items-center w-6 h-6 rounded-full bg-success/15 text-success">
            <Check className="w-3.5 h-3.5" />
          </span>
          <span>
            Finviz Elite connected <span className="text-muted num">· token ••••{status.hint}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Replace token
          </Button>
          <Button size="sm" variant="ghost" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border bg-background ${compact ? "p-3" : "p-4"} space-y-3`}>
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-accent/10 text-accent">
          <KeyRound className="w-4 h-4" />
        </span>
        <div className="text-sm space-y-1">
          <p className="font-medium">Connect your Finviz Elite account</p>
          <p className="text-xs text-muted">
            The screener runs on your own Finviz Elite subscription. In Finviz Elite, open any screener and use{" "}
            <b>Export</b>; the link it gives you contains <code className="num">auth=…</code>. Paste that link or just the token.
          </p>
          <a
            href="https://elite.finviz.com/screener.ashx"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Open Finviz Elite <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) connect();
        }}
      >
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Finviz Elite API token or export link"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 px-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          aria-label="Finviz Elite API token"
        />
        <Button type="submit" size="sm" disabled={busy || !token.trim()}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {busy ? "Checking…" : "Connect"}
        </Button>
        {status.connected && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-[11px] text-muted">We check the token with Finviz, then store it encrypted. It&apos;s only used to run your screens.</p>
    </div>
  );
}
