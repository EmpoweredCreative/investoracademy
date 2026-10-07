"use client";

import { useState, type ReactNode } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface Column<T> {
  key: keyof T & string;
  label: string;
  type: "text" | "money" | "select" | "number" | "checkbox";
  options?: { value: string; label: string }[];
  /** Optional fields save as null when left blank. */
  optional?: boolean;
  placeholder?: string;
  hint?: string;
  display?: (row: T) => ReactNode;
  align?: "right";
  className?: string;
}

type Draft = Record<string, string | boolean>;

/** A list of records edited in place: click a row's pencil to edit, "Add" for a new row. */
export function EditableTable<T extends { id: string }>({
  rows,
  columns,
  newRow,
  onCreate,
  onUpdate,
  onDelete,
  addLabel,
  emptyText,
  footer,
}: {
  rows: T[];
  columns: Column<T>[];
  newRow: () => Partial<T>;
  onCreate: (values: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, values: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  addLabel: string;
  emptyText: string;
  footer?: ReactNode;
}) {
  const [editing, setEditing] = useState<string | null>(null); // row id or "new"
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  const toDraft = (row: Partial<T>): Draft =>
    Object.fromEntries(
      columns.map((c) => {
        const v = row[c.key];
        return [c.key, c.type === "checkbox" ? Boolean(v) : v == null ? "" : String(v)];
      })
    );

  const start = (id: string, row: Partial<T>) => {
    setEditing(id);
    setDraft(toDraft(row));
    setError(null);
  };

  const values = (): Record<string, unknown> | null => {
    const out: Record<string, unknown> = {};
    for (const c of columns) {
      const v = draft[c.key];
      if (c.type === "checkbox") {
        out[c.key] = Boolean(v);
        continue;
      }
      const s = String(v ?? "").trim();
      if (!s) {
        if (!c.optional) {
          setError(`${c.label} is required.`);
          return null;
        }
        out[c.key] = null;
        continue;
      }
      if (c.type === "money" || c.type === "number") {
        const n = Number(s.replace(/[$,]/g, ""));
        if (!Number.isFinite(n) || n < 0) {
          setError(`${c.label} must be a number.`);
          return null;
        }
        out[c.key] = n;
      } else out[c.key] = s;
    }
    return out;
  };

  const save = async () => {
    const v = values();
    if (!v || !editing) return;
    setSaving(true);
    try {
      if (editing === "new") await onCreate(v);
      else await onUpdate(editing, v);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await onDelete(deleting.id);
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  };

  const editRow = (key: string) => (
    <tr key={key} className="bg-accent/5 border-b border-border/60">
      {columns.map((c) => (
        <td key={c.key} className={`py-2 px-2 align-top ${c.className ?? ""}`}>
          <Field column={c} value={draft[c.key]} onChange={(v) => setDraft((d) => ({ ...d, [c.key]: v }))} onEnter={save} />
        </td>
      ))}
      <td className="py-2 px-2 align-top whitespace-nowrap text-right">
        <button type="button" onClick={save} disabled={saving} className="p-1.5 rounded-md text-success hover:bg-success/10" aria-label="Save">
          <Check className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-md text-muted hover:bg-card-hover" aria-label="Cancel">
          <X className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted border-b border-border">
              {columns.map((c) => (
                <th key={c.key} className={`font-semibold py-2 px-2 ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.label}
                </th>
              ))}
              <th className="w-[76px]" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && editing !== "new" && (
              <tr>
                <td colSpan={columns.length + 1} className="py-6 px-3 text-center text-muted">
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((row) =>
              editing === row.id ? (
                editRow(row.id)
              ) : (
                <tr key={row.id} className="group border-b border-border/50 last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className={`py-2 px-2 ${c.align === "right" ? "text-right num" : ""} ${c.className ?? ""}`}>
                      {c.display ? c.display(row) : displayValue(c, row[c.key])}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => start(row.id, row)}
                      className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-card-hover"
                      aria-label="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(row)}
                      className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-card-hover"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            )}
            {editing === "new" && editRow("new")}
          </tbody>
          {footer && <tfoot className="border-t border-border">{footer}</tfoot>}
        </table>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {editing !== "new" && (
        <button
          type="button"
          onClick={() => start("new", newRow())}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          <Plus className="w-4 h-4" />
          {addLabel}
        </button>
      )}
      <ConfirmDialog
        open={deleting != null}
        title="Delete this item?"
        loading={saving}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      >
        This removes it from your Foundation totals.
      </ConfirmDialog>
    </div>
  );
}

function displayValue<T>(c: Column<T>, v: unknown): ReactNode {
  if (v == null || v === "") return <span className="text-muted">—</span>;
  if (c.type === "money") return Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (c.type === "select") return c.options?.find((o) => o.value === v)?.label ?? String(v);
  if (c.type === "checkbox") return v ? "Yes" : "No";
  return String(v);
}

const inputCls =
  "w-full px-2 py-1.5 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/50";

function Field<T>({
  column: c,
  value,
  onChange,
  onEnter,
}: {
  column: Column<T>;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
  onEnter: () => void;
}) {
  if (c.type === "checkbox") {
    return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="mt-2" aria-label={c.label} />;
  }
  if (c.type === "select") {
    return (
      <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={inputCls} aria-label={c.label}>
        {c.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div>
      <input
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        inputMode={c.type === "text" ? undefined : "decimal"}
        placeholder={c.placeholder ?? (c.optional ? "Optional" : undefined)}
        className={`${inputCls} ${c.align === "right" ? "text-right" : ""}`}
        aria-label={c.label}
      />
      {c.hint && <p className="mt-0.5 text-[10px] text-muted">{c.hint}</p>}
    </div>
  );
}
