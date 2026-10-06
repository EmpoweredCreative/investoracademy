"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FundamentalChatPanel } from "@/components/fundamentals/FundamentalChatPanel";
import { ANALYST_NAME } from "@/lib/brand";

/**
 * "Ask the Analyst" button + slide-over chat. Once opened, the chat stays mounted
 * (just hidden) so an answer in progress keeps streaming after the drawer closes.
 */
export function AnalystDrawer({
  accountId,
  symbol,
  disabled,
  disabledReason,
  onResearchChange,
  onTurnEnd,
  onOwnStrategy,
}: {
  accountId: string;
  /** Scope the conversation to one stock; omit for the account-wide research desk. */
  symbol?: string;
  disabled?: boolean;
  disabledReason?: string;
  onResearchChange?: () => void;
  onTurnEnd?: () => void;
  onOwnStrategy?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <Sparkles className="w-4 h-4" /> Ask the Analyst
      </Button>

      {mounted && (
        <div
          className={`fixed inset-0 z-50 flex justify-end transition-colors ${open ? "bg-black/30" : "pointer-events-none bg-transparent"}`}
          onClick={() => setOpen(false)}
          aria-hidden={!open}
        >
          <div
            className={`relative w-full max-w-xl h-full p-3 transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={ANALYST_NAME}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-5 right-14 z-10 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover"
              aria-label={`Close ${ANALYST_NAME}`}
            >
              <X className="w-4 h-4" />
            </button>
            <FundamentalChatPanel
              accountId={accountId}
              symbol={symbol}
              variant={symbol ? "panel" : "desk"}
              heightClass="h-full"
              disabled={disabled}
              disabledReason={disabledReason}
              onResearchChange={onResearchChange}
              onTurnEnd={onTurnEnd}
              onOwnStrategy={
                onOwnStrategy &&
                (() => {
                  setOpen(false);
                  onOwnStrategy();
                })
              }
            />
          </div>
        </div>
      )}
    </>
  );
}
