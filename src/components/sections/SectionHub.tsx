"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useSelectedAccount } from "@/contexts/SelectedAccountContext";
import { type Section, toolHref, visibleGroups } from "@/lib/sections";
import { hasBusinessProfile, useProfileType } from "./useProfileType";

/** Title block at the top of a section hub. */
export function SectionHeader({ section, right }: { section: Section; right?: ReactNode }) {
  return (
    <div className="rise-in flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted font-semibold flex items-center gap-2">
          <section.icon className="w-3.5 h-3.5" />
          {section.label}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">{section.label}</h1>
        <p className="text-muted text-sm mt-1">{section.tagline}</p>
      </div>
      {right}
    </div>
  );
}

/** Grid of tool cards for a section, grouped. */
export function ToolGrid({ section }: { section: Section }) {
  const { selectedAccountId } = useSelectedAccount();
  const groups = visibleGroups(section, hasBusinessProfile(useProfileType()));

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.label} className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em]">{group.label}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {group.tools.map((tool) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent/10 text-accent">
                      <tool.icon className="w-4.5 h-4.5" />
                    </span>
                    {tool.soon ? (
                      <Badge>Coming soon</Badge>
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                  <p className="mt-3 font-semibold text-sm">{tool.label}</p>
                  <p className="mt-1 text-xs text-muted">{tool.description}</p>
                </>
              );
              return (
                <Link
                  key={tool.slug}
                  href={toolHref(section, tool, selectedAccountId)}
                  className="group block rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:bg-card-hover hover:-translate-y-px hover:border-accent/40"
                >
                  {body}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Small stat tile for hub snapshots. Pass value=null to show an empty placeholder. */
export function SnapshotStat({
  label,
  value,
  hint,
  tone = "",
}: {
  label: string;
  value: ReactNode | null;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5 shadow-card">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">{label}</p>
      <p className={`num mt-1.5 text-xl font-semibold ${value == null ? "text-muted/60" : tone}`}>
        {value ?? "—"}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
