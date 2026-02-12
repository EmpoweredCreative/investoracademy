"use client";

import { ReactNode } from "react";
import { Card } from "./Card";
import { Button } from "./Button";

interface ConfirmDialogProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** Dialog title */
  title: string;
  /** Description / body — can be a string or JSX */
  children: ReactNode;
  /** Label for the confirm button (default "Delete") */
  confirmLabel?: string;
  /** Label for the cancel button (default "Cancel") */
  cancelLabel?: string;
  /** Whether the confirm action is in progress */
  loading?: boolean;
  /** Called when the user confirms */
  onConfirm: () => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

/**
 * Full-screen overlay confirmation dialog.
 * Use for destructive actions (delete, remove, etc.) across the project.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <Card className="w-full max-w-sm">
        <div className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="text-sm text-muted">{children}</div>
          <div className="flex gap-3">
            <Button variant="danger" loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              {cancelLabel}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
