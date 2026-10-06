"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Link2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LiveDot, Panel, fmtUsd } from "@/components/live/primitives";
import { useNow } from "@/components/live/LiveProvider";

interface Status {
  configured: boolean;
  redirectUri: string | null;
  connection: {
    status: "ACTIVE" | "EXPIRING" | "EXPIRED" | "ERROR";
    refreshExpiresAt: string;
    lastSyncAt: string | null;
    lastError: string | null;
    accounts: {
      id: string;
      name: string;
      brokerAccountMask: string | null;
      lastSyncedAt: string | null;
      lastSyncError: string | null;
      syncedNetLiq: number | null;
    }[];
  } | null;
}

interface SchwabAccountOption {
  hash: string;
  mask: string;
  type: string | null;
  netLiq: number | null;
  cash: number | null;
  positions: number;
  linkedAccountId: string | null;
  linkedAccountName: string | null;
}

interface SyncResult {
  transactionsImported: number;
  optionsOpened: number;
  optionsClosed: number;
  positionsReconciled: number;
  netLiq: number | null;
  warnings: string[];
}

const STEPS = ["Before you start", "Authorize", "Choose accounts", "First sync", "Connected"] as const;

export default function ConnectSchwabPage() {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-card border border-border animate-pulse" />}>
      <ConnectSchwab />
    </Suspense>
  );
}

function ConnectSchwab() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [syncing, setSyncing] = useState<{ names: string[]; results: (SyncResult | string | null)[] } | null>(null);
  const oauthError = params.get("error");
  const wantAccounts = params.get("step") === "accounts";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/brokers/schwab", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load connection status");
      setStatus(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load connection status");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const conn = status?.connection;
  const connected = conn && conn.status !== "EXPIRED";
  const step = !status
    ? 0
    : syncing
      ? syncing.results.every((r) => r !== null)
        ? 4
        : 3
      : !connected
        ? status.configured
          ? 1
          : 0
        : wantAccounts || conn.accounts.length === 0
          ? 2
          : 4;

  const runFirstSync = async (linked: { id: string; name: string }[]) => {
    setSyncing({ names: linked.map((l) => l.name), results: linked.map(() => null) });
    router.replace("/connect/schwab");
    await Promise.all(
      linked.map(async (acct, i) => {
        let outcome: SyncResult | string;
        try {
          const res = await fetch(`/api/accounts/${acct.id}/sync`, { method: "POST" });
          const data = await res.json();
          outcome = res.ok ? data : data.error ?? "Sync failed";
        } catch {
          outcome = "Network error during sync";
        }
        setSyncing((s) => (s ? { ...s, results: s.results.map((r, j) => (j === i ? outcome : r)) } : s));
      })
    );
    load();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="rise-in">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">Connection guide</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Connect Charles Schwab</h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">
          Link your Schwab accounts so positions, balances, trades and commissions flow in automatically. Access is
          read-only: this app can never place trades or move money.
        </p>
      </div>

      <Stepper current={step} />

      {loadError && <Notice tone="danger">{loadError}</Notice>}
      {oauthError && <Notice tone="danger">{oauthError}</Notice>}
      {conn?.status === "EXPIRED" && (
        <Notice tone="warning">
          Your Schwab authorization expired. Schwab requires signing in again every 7 days. Reconnect below; your
          linked accounts and history are kept.
        </Notice>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-4">
          {!status ? (
            <div className="h-72 rounded-2xl bg-card border border-border animate-pulse" />
          ) : step === 0 ? (
            <SetupPanel redirectUri={status.redirectUri} />
          ) : step === 1 ? (
            <AuthorizePanel reconnect={conn?.status === "EXPIRED"} />
          ) : step === 2 ? (
            <ChooseAccounts onLinked={runFirstSync} />
          ) : syncing ? (
            <SyncProgress names={syncing.names} results={syncing.results} />
          ) : (
            <ConnectionCard status={status} onChange={load} />
          )}
        </div>
        <div className="space-y-4">
          <ConnectivityHub active={step >= 3 ? (syncing && step === 3 ? "syncing" : "live") : step >= 2 ? "authorized" : "idle"} />
          <WhatSyncs />
        </div>
      </div>
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────

function Stepper({ current }: { current: number }) {
  return (
    <ol className="rise-in grid grid-cols-5 gap-2">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-col gap-2">
            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ${done || active ? "bg-accent" : ""}`}
                style={{ width: done ? "100%" : active ? "50%" : "0%" }}
              />
            </div>
            <span className={`flex items-center gap-1.5 text-xs ${active ? "text-foreground font-semibold" : "text-muted"}`}>
              <span
                className={`grid place-items-center w-4 h-4 rounded-full text-[9px] font-bold ${
                  done ? "bg-accent text-white" : active ? "border-2 border-accent text-accent" : "border border-border"
                }`}
              >
                {done ? <Check className="w-2.5 h-2.5" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Notice({ tone, children }: { tone: "danger" | "warning" | "success"; children: React.ReactNode }) {
  const styles = {
    danger: "border-danger/30 bg-danger/5 text-danger",
    warning: "border-warning/30 bg-warning/5 text-warning",
    success: "border-success/30 bg-success/5 text-success",
  }[tone];
  return (
    <div className={`slide-in flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="text-foreground">{children}</div>
    </div>
  );
}

// ─── Step 0: server setup ────────────────────────────────────

function SetupPanel({ redirectUri }: { redirectUri: string | null }) {
  const suggested = redirectUri ?? "https://127.0.0.1:3000/api/brokers/schwab/callback";
  return (
    <Panel title="Step 1 · Create your Schwab developer app" subtitle="one-time setup">
      <ol className="space-y-4 text-sm">
        <SetupStep n={1} title="Register at developer.schwab.com">
          Sign in with your Schwab login, then <b>Dashboard → Apps → Create App</b>. Choose the API product{" "}
          <b>Accounts and Trading Production</b> (and <b>Market Data Production</b> for quotes).
          <a
            href="https://developer.schwab.com"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-accent hover:underline"
          >
            Open developer.schwab.com <ExternalLink className="w-3 h-3" />
          </a>
        </SetupStep>
        <SetupStep n={2} title="Set the callback URL exactly">
          <code className="num mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-xs break-all">{suggested}</code>
          <span className="text-muted text-xs">
            For local testing run <code className="num">npm run dev:https</code> and open the app at{" "}
            <code className="num">https://127.0.0.1:3000</code>. Add your production URL as a second callback when you deploy.
          </span>
        </SetupStep>
        <SetupStep n={3} title="Wait for approval">
          Schwab reviews new apps. The status changes from <i>Approved – Pending</i> to <b>Ready For Use</b>, usually
          within a few business days.
        </SetupStep>
        <SetupStep n={4} title="Add the keys to the server environment">
          <pre className="num mt-1 rounded-lg border border-border bg-background px-3 py-2 text-xs overflow-x-auto">{`SCHWAB_CLIENT_ID=<App Key>
SCHWAB_CLIENT_SECRET=<Secret>
SCHWAB_REDIRECT_URI=${suggested}
TOKEN_ENCRYPTION_KEY=<32 random bytes, base64>`}</pre>
          <span className="text-muted text-xs">Restart the server, then reload this page.</span>
        </SetupStep>
      </ol>
    </Panel>
  );
}

function SetupStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="num grid place-items-center w-6 h-6 shrink-0 rounded-full bg-accent/10 text-accent text-xs font-bold">{n}</span>
      <div className="space-y-1 min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="text-muted">{children}</div>
      </div>
    </li>
  );
}

// ─── Step 1: authorize ───────────────────────────────────────

function AuthorizePanel({ reconnect }: { reconnect: boolean }) {
  const [going, setGoing] = useState(false);
  return (
    <Panel title={reconnect ? "Reconnect Schwab" : "Authorize read access"} subtitle="takes about a minute">
      <ul className="space-y-3 text-sm">
        <Bullet icon={Lock}>You sign in on Schwab&apos;s own site. Your Schwab password never touches this app.</Bullet>
        <Bullet icon={ShieldCheck}>Read-only: positions, balances and transaction history. No trading, no transfers.</Bullet>
        <Bullet icon={KeyRound}>
          Tokens are encrypted at rest. Schwab expires them after <b>7 days</b>; you&apos;ll get a reminder to reconnect.
        </Bullet>
      </ul>
      <div className="mt-6 flex items-center gap-3">
        <a href="/api/brokers/schwab/connect" onClick={() => setGoing(true)}>
          <Button size="lg" loading={going}>
            <Link2 className="w-4 h-4" />
            {reconnect ? "Reconnect with Schwab" : "Continue to Schwab"}
          </Button>
        </a>
        <span className="text-xs text-muted">You&apos;ll come back here to pick accounts.</span>
      </div>
    </Panel>
  );
}

function Bullet({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <Icon className="w-4 h-4 text-success mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

// ─── Step 2: choose accounts ─────────────────────────────────

function ChooseAccounts({ onLinked }: { onLinked: (linked: { id: string; name: string }[]) => void }) {
  const [options, setOptions] = useState<SchwabAccountOption[] | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/brokers/schwab/accounts", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not load Schwab accounts");
        const list: SchwabAccountOption[] = data.accounts;
        setOptions(list);
        setSelected(
          Object.fromEntries(
            list
              .filter((a) => !a.linkedAccountId)
              .map((a) => [a.hash, `Schwab ${a.type === "MARGIN" ? "Margin" : a.type === "CASH" ? "Cash" : ""} ${a.mask.slice(-4)}`.replace(/\s+/g, " ")])
          )
        );
      })
      .catch((e) => setError(e.message));
  }, []);

  const toggle = (a: SchwabAccountOption) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[a.hash] !== undefined) delete next[a.hash];
      else next[a.hash] = `Schwab ${a.mask.slice(-4)}`;
      return next;
    });

  const link = async () => {
    setSaving(true);
    setError("");
    const res = await fetch("/api/brokers/schwab/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: Object.entries(selected).map(([hash, name]) => ({ hash, name: name.trim() || "Schwab" })) }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not link accounts");
      return;
    }
    onLinked(data.linked);
  };

  const count = Object.keys(selected).length;
  return (
    <Panel title="Choose accounts to sync" subtitle="from your Schwab login">
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!options ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-border/40 animate-pulse" />
          ))}
        </div>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted">No accounts were returned for this Schwab login.</p>
      ) : (
        <div className="space-y-2">
          {options.map((a) => {
            const isSelected = selected[a.hash] !== undefined;
            return (
              <div
                key={a.hash}
                className={`rounded-xl border p-4 transition-colors ${
                  a.linkedAccountId ? "border-border opacity-70" : isSelected ? "border-accent bg-accent/5" : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--accent)]"
                    checked={isSelected}
                    disabled={!!a.linkedAccountId}
                    onChange={() => toggle(a)}
                    aria-label={`Sync account ${a.mask}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold num">
                      {a.mask} <span className="font-sans text-xs text-muted font-normal">{a.type?.toLowerCase()}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {a.positions} positions{a.cash != null ? ` · ${fmtUsd(a.cash, 0)} cash` : ""}
                      {a.linkedAccountName ? ` · linked as “${a.linkedAccountName}”` : ""}
                    </p>
                  </div>
                  {a.netLiq != null && <span className="num font-semibold">{fmtUsd(a.netLiq, 0)}</span>}
                </div>
                {isSelected && (
                  <div className="mt-3 pl-7">
                    <Input
                      label="Name in this app"
                      value={selected[a.hash]}
                      onChange={(e) => setSelected((s) => ({ ...s, [a.hash]: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">The first sync imports the last 12 months of trades.</span>
        <Button onClick={link} loading={saving} disabled={count === 0}>
          Link {count || ""} account{count === 1 ? "" : "s"} <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </Panel>
  );
}

// ─── Step 3: first sync ──────────────────────────────────────

function SyncProgress({ names, results }: { names: string[]; results: (SyncResult | string | null)[] }) {
  const phases = ["Balances", "Positions", "Trades & fees", "Buckets"];
  const now = useNow(700);
  const done = results.every((r) => r !== null);
  return (
    <Panel title={done ? "Sync complete" : "Syncing from Schwab"} subtitle={done ? undefined : "this can take a minute"}>
      <div className="space-y-4">
        {names.map((name, i) => {
          const r = results[i];
          const failed = typeof r === "string";
          const ok = r && !failed ? (r as SyncResult) : null;
          const tick = Math.floor(now / 700) % phases.length;
          return (
            <div key={name} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{name}</span>
                {r === null ? (
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {phases[tick]}…
                  </span>
                ) : failed ? (
                  <span className="text-xs text-danger">Failed</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <Check className="w-3.5 h-3.5" /> Synced
                  </span>
                )}
              </div>
              {r === null && (
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {phases.map((p, j) => (
                    <div key={p} className={`h-1.5 rounded-full ${j <= tick ? "bg-accent" : "bg-border"} transition-colors`} />
                  ))}
                </div>
              )}
              {failed && <p className="mt-2 text-xs text-danger">{r as string}</p>}
              {ok && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Count label="Net liq" value={ok.netLiq != null ? fmtUsd(ok.netLiq, 0) : "—"} />
                  <Count label="Trades imported" value={ok.transactionsImported} />
                  <Count label="Options opened" value={ok.optionsOpened} />
                  <Count label="Options closed" value={ok.optionsClosed} />
                  {ok.warnings.length > 0 && <p className="col-span-full text-warning">{ok.warnings.join(" · ")}</p>}
                </div>
              )}
            </div>
          );
        })}
        {done && (
          <div className="flex justify-end">
            <Link href="/dashboard">
              <Button>
                Go to your desk <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Count({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-background/60 border border-border px-2.5 py-1.5">
      <div className="text-muted">{label}</div>
      <div className="num font-semibold text-sm">{value}</div>
    </div>
  );
}

// ─── Step 4: connected ───────────────────────────────────────

function ConnectionCard({ status, onChange }: { status: Status; onChange: () => void }) {
  const conn = status.connection!;
  const now = useNow(1000);
  const msLeft = new Date(conn.refreshExpiresAt).getTime() - now;
  const pct = Math.max(0, Math.min(100, (msLeft / (7 * 24 * 3600_000)) * 100));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const syncOne = async (id: string) => {
    setBusy(id);
    setMessage("");
    const res = await fetch(`/api/accounts/${id}/sync`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    setMessage(res.ok ? `Synced: ${data.transactionsImported} new trade${data.transactionsImported === 1 ? "" : "s"}.` : data.error ?? "Sync failed");
    onChange();
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Schwab? Linked accounts keep their history but stop syncing.")) return;
    setBusy("disconnect");
    await fetch("/api/brokers/schwab", { method: "DELETE" });
    setBusy(null);
    onChange();
  };

  const tone = conn.status === "ACTIVE" ? "success" : conn.status === "EXPIRING" ? "warning" : "danger";
  const days = Math.floor(msLeft / 86400_000);
  const hours = Math.floor((msLeft % 86400_000) / 3600_000);

  return (
    <Panel
      title="Schwab connected"
      right={
        <span className="flex items-center gap-1.5 text-xs">
          <LiveDot tone={tone} /> {conn.status.toLowerCase()}
        </span>
      }
    >
      <div className="flex items-center gap-5">
        <ExpiryRing pct={pct} label={msLeft > 0 ? `${days}d ${hours}h` : "expired"} />
        <div className="text-sm space-y-1">
          <p className="font-semibold">Authorization renews weekly</p>
          <p className="text-muted">
            Schwab requires signing in again every 7 days. Reconnect any time to reset the clock.
          </p>
          <a href="/api/brokers/schwab/connect" className="inline-flex items-center gap-1 text-accent text-xs hover:underline">
            <RefreshCw className="w-3 h-3" /> Reconnect now
          </a>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {conn.accounts.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <div className="flex-1 min-w-0">
              <Link href={`/accounts/${a.id}`} className="font-semibold hover:text-accent">
                {a.name}
              </Link>
              <p className="text-xs text-muted">
                <span className="num">{a.brokerAccountMask}</span>
                {a.lastSyncedAt ? ` · synced ${new Date(a.lastSyncedAt).toLocaleString()}` : " · not synced yet"}
              </p>
              {a.lastSyncError && <p className="text-xs text-warning mt-0.5">{a.lastSyncError}</p>}
            </div>
            {a.syncedNetLiq != null && <span className="num font-semibold">{fmtUsd(a.syncedNetLiq, 0)}</span>}
            <Button size="sm" variant="secondary" onClick={() => syncOne(a.id)} loading={busy === a.id}>
              <RefreshCw className="w-3.5 h-3.5" /> Sync
            </Button>
          </div>
        ))}
      </div>
      {message && <p className="mt-3 text-xs text-muted">{message}</p>}

      <div className="mt-5 flex items-center justify-between">
        <Link href="/connect/schwab?step=accounts" className="text-xs text-accent hover:underline">
          Link another Schwab account
        </Link>
        <Button size="sm" variant="ghost" onClick={disconnect} loading={busy === "disconnect"} className="text-muted hover:text-danger">
          <Unplug className="w-3.5 h-3.5" /> Disconnect
        </Button>
      </div>
    </Panel>
  );
}

function ExpiryRing({ pct, label }: { pct: number; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const color = pct > 20 ? "var(--success)" : pct > 5 ? "var(--warning)" : "var(--danger)";
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0" aria-label={`Authorization: ${label} left`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 38 38)"
        style={{ transition: "stroke-dasharray 800ms ease" }}
      />
      <text x="38" y="42" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--fg)" className="num">
        {label}
      </text>
    </svg>
  );
}

// ─── Side panels ─────────────────────────────────────────────

/** Animated diagram: data feeds flowing from Schwab into the app. */
function ConnectivityHub({ active }: { active: "idle" | "authorized" | "syncing" | "live" }) {
  const feeds = useMemo(
    () => [
      { label: "Balances", y: 34 },
      { label: "Positions", y: 82 },
      { label: "Trades", y: 130 },
      { label: "Fees", y: 178 },
    ],
    []
  );
  const flowing = active === "syncing" || active === "live";
  const stroke = active === "idle" ? "var(--border)" : "var(--accent)";
  return (
    <Panel
      title="Connectivity"
      right={
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <LiveDot tone={active === "live" ? "success" : active === "idle" ? "muted" : "warning"} pulse={active !== "idle"} />
          {active === "idle" ? "not connected" : active === "authorized" ? "authorized" : active === "syncing" ? "syncing" : "live"}
        </span>
      }
      bodyClassName="p-3"
    >
      <svg viewBox="0 0 320 212" className="w-full" role="img" aria-label="Data flow from Schwab to this app">
        <g>
          <rect x="8" y="78" width="78" height="56" rx="12" fill="var(--card)" stroke={stroke} strokeWidth="1.5" />
          <text x="47" y="104" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--fg)">Schwab</text>
          <text x="47" y="120" textAnchor="middle" fontSize="9" fill="var(--muted)">Trader API</text>
        </g>
        {feeds.map((f, i) => (
          <g key={f.label}>
            <path
              d={`M86 106 C 140 106, 140 ${f.y}, 190 ${f.y}`}
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
              className={flowing ? "flow-dash" : ""}
              style={flowing ? { animationDuration: `${0.8 + i * 0.25}s` } : undefined}
              opacity={active === "idle" ? 0.6 : 1}
            />
            <rect x="190" y={f.y - 12} width="64" height="24" rx="8" fill="var(--card)" stroke="var(--border)" />
            <text x="222" y={f.y + 4} textAnchor="middle" fontSize="10" fill="var(--fg)">{f.label}</text>
            <path d={`M254 ${f.y} C 280 ${f.y}, 280 106, 300 106`} fill="none" stroke={stroke} strokeWidth="1.2" opacity="0.5" />
          </g>
        ))}
        <circle cx="304" cy="106" r="9" fill={active === "live" ? "var(--success)" : stroke} />
        {flowing && <circle cx="304" cy="106" r="9" fill="var(--success)" className="live-ping" style={{ transformOrigin: "304px 106px" }} />}
      </svg>
    </Panel>
  );
}

function WhatSyncs() {
  const [open, setOpen] = useState(false);
  return (
    <Panel title="What syncs" bodyClassName="p-4 text-sm space-y-2">
      <p className="text-muted">
        Balances and positions refresh about every 5 minutes while you have the app open during market hours, plus a
        daily sync after the close.
      </p>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs text-accent">
        Details <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="list-disc pl-5 text-xs text-muted space-y-1">
          <li>Stocks and ETFs become share lots at Schwab&apos;s average cost.</li>
          <li>Option trades open and close automatically, including expirations and assignments.</li>
          <li>Commissions and regulatory fees are recorded on every trade.</li>
          <li>Closed covered calls and puts on Core stocks flow into each stock&apos;s premium bucket.</li>
          <li>Multi-leg orders (spreads, condors) are grouped and tagged Speculation.</li>
          <li>New stocks default to Core, option-only symbols to Speculation. You can change either.</li>
        </ul>
      )}
    </Panel>
  );
}
