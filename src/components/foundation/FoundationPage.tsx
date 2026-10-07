"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Briefcase, Building2, Info, Layers } from "lucide-react";
import { PROFILE_OPTIONS } from "@/lib/foundation/labels";
import { useFoundation, type FoundationData } from "./useFoundation";

type Api = ReturnType<typeof useFoundation>;

/**
 * Frame for every Foundation page: header, loading and error states, and the
 * one-time "how do you earn?" question before anything else.
 */
export function FoundationPage({
  title,
  subtitle,
  back = true,
  children,
}: {
  title: string;
  subtitle: string;
  back?: boolean;
  children: (data: FoundationData, api: Api) => ReactNode;
}) {
  const api = useFoundation();
  const { data, error } = api;

  return (
    <div className="space-y-6">
      <div className="rise-in">
        {back && (
          <Link href="/foundation" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Foundation
          </Link>
        )}
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{title}</h1>
        <p className="text-muted text-sm mt-1">{subtitle}</p>
      </div>

      {error && !data ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">{error}</div>
      ) : !data ? (
        <div className="space-y-3">
          <div className="h-28 rounded-2xl bg-card border border-border animate-pulse" />
          <div className="h-64 rounded-2xl bg-card border border-border animate-pulse" />
        </div>
      ) : !data.profile.type ? (
        <ProfilePicker onPick={(profileType) => api.setPreferences({ profileType })} />
      ) : (
        children(data, api)
      )}
    </div>
  );
}

const PROFILE_ICONS = { EMPLOYEE: Briefcase, BUSINESS_OWNER: Building2, BOTH: Layers } as const;

export function ProfilePicker({ onPick, current }: { onPick: (v: string) => Promise<void>; current?: string | null }) {
  const [saving, setSaving] = useState<string | null>(null);
  return (
    <section className="rise-in rounded-2xl border border-border bg-card p-6 shadow-card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">How do you earn your money?</h2>
        <p className="text-sm text-muted mt-1">
          This sets up the right tools for you. Business owners also get a business P&amp;L and a tax-reserve line. You can
          change it anytime in Settings.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PROFILE_OPTIONS.map((o) => {
          const Icon = PROFILE_ICONS[o.value as keyof typeof PROFILE_ICONS];
          const active = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={saving != null}
              onClick={async () => {
                setSaving(o.value);
                try {
                  await onPick(o.value);
                } finally {
                  setSaving(null);
                }
              }}
              className={`text-left rounded-2xl border p-4 transition-all hover:-translate-y-px ${
                active ? "border-accent bg-accent/5" : "border-border hover:border-accent/40 hover:bg-card-hover"
              }`}
            >
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent/10 text-accent">
                <Icon className="w-4.5 h-4.5" />
              </span>
              <p className="mt-3 font-semibold text-sm">{saving === o.value ? "Saving…" : o.label}</p>
              <p className="mt-1 text-xs text-muted">{o.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Stat tile used across Foundation pages. */
export function Tile({
  label,
  value,
  hint,
  tone = "",
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-card px-4 py-3.5 shadow-card ${emphasis ? "border-accent/40" : "border-border"}`}>
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">{label}</p>
      <p className={`num mt-1.5 text-xl font-semibold ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
        tone === "warning" ? "border-warning/30 bg-warning/10 text-foreground" : "border-border bg-background/60 text-muted"
      }`}
    >
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
