"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ListChecks } from "lucide-react";

export interface ChecklistItem {
  label: string;
  children?: ChecklistItem[];
}

/** One step of the daily routine: header with done state, live content, and the routine checklist. */
export function StepCard({
  index,
  title,
  quote,
  done,
  onToggleDone,
  badge,
  checklist,
  defaultOpen = true,
  children,
}: {
  index: number;
  title: string;
  quote: string;
  done: boolean;
  onToggleDone: () => void;
  badge?: ReactNode;
  checklist?: ChecklistItem[];
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`rise-in rounded-2xl border bg-card shadow-card transition-colors ${
        done ? "border-success/30" : "border-border"
      }`}
    >
      <header className="flex items-center gap-3 px-5 py-4">
        <span
          className={`grid place-items-center w-8 h-8 shrink-0 rounded-full text-sm font-semibold ${
            done ? "bg-success text-background" : "bg-accent/10 text-accent"
          }`}
        >
          {done ? <Check className="w-4 h-4" /> : index}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-0 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <span className="font-semibold">{title}</span>
            {badge}
          </span>
          <span className="block text-xs text-muted italic truncate">{quote}</span>
        </button>
        <button
          type="button"
          onClick={onToggleDone}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
            done
              ? "border-success/30 bg-success/10 text-success hover:bg-success/15"
              : "border-border text-muted hover:text-foreground hover:bg-card-hover"
          }`}
        >
          {done ? "Done" : "Mark done"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 p-1 text-muted hover:text-foreground"
          aria-label={open ? "Collapse step" : "Expand step"}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
      </header>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {children}
          {checklist && <Checklist items={checklist} />}
        </div>
      )}
    </section>
  );
}

function Checklist({ items }: { items: ChecklistItem[] }) {
  return (
    <details className="group rounded-xl border border-border bg-background/50">
      <summary className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted cursor-pointer select-none hover:text-foreground">
        <ListChecks className="w-3.5 h-3.5" />
        Routine checklist
        <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-3">
        <ChecklistList items={items} />
      </div>
    </details>
  );
}

function ChecklistList({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.label}>
          <span className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-accent/60" />
            {item.label}
          </span>
          {item.children && (
            <div className="ml-4 mt-1 text-muted">
              <ChecklistList items={item.children} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Small uppercase label used inside steps. */
export function StepLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{children}</h3>
      {right}
    </div>
  );
}
