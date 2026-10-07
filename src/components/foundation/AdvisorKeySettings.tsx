"use client";

import { useEffect, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FIRST_MONTH_LIMIT, MONTHLY_LIMIT } from "@/lib/foundation/advisorLimits";

/** Settings card: optional personal Anthropic key for unlimited advisor messages. */
export function AdvisorKeySettings() {
  const [status, setStatus] = useState<{ connected: boolean; hint: string | null } | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/foundation/advisor/key")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false, hint: null }));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/foundation/advisor/key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "Couldn't save the key.");
    setStatus(data);
    setKey("");
  };

  const remove = async () => {
    setSaving(true);
    const res = await fetch("/api/foundation/advisor/key", { method: "DELETE" });
    setSaving(false);
    if (res.ok) setStatus({ connected: false, hint: null });
  };

  return (
    <Card>
      <div id="claude-key" />
      <CardHeader>
        <CardTitle>Your own AI key for the advisor (optional)</CardTitle>
        <CardDescription>
          The Foundation advisor includes {FIRST_MONTH_LIMIT} messages in your first month and {MONTHLY_LIMIT} a month after that.
          Add your own API key for unlimited messages, billed to your own account (typically a few cents per message).
        </CardDescription>
      </CardHeader>
      {status?.connected ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Connected · key ending <span className="num">····{status.hint}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={remove} loading={saving}>
            Remove key
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <Button onClick={save} loading={saving} disabled={!key.trim() || status === null}>
              Connect
            </Button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <p className="text-xs text-muted">
            This needs an Anthropic API key, which you can create at console.anthropic.com. We check the key, then store it
            encrypted. It&apos;s only used for your advisor messages.
          </p>
        </div>
      )}
    </Card>
  );
}
