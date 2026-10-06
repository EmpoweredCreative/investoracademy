"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

const WIDTH = 256;
const GAP = 6;
const MARGIN = 8;

/**
 * Small "i" icon that explains a term. Opens on hover, keyboard focus or tap, and
 * renders in a portal so overflow-hidden panels can't clip it.
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(r.left + r.width / 2 - WIDTH / 2, MARGIN), window.innerWidth - WIDTH - MARGIN);
    const above = r.bottom + 160 > window.innerHeight;
    setPos({ top: above ? r.top - GAP : r.bottom + GAP, left, above });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    const onScroll = () => hide();
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [pos, hide]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`What is ${label}?`}
        aria-describedby={pos ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          // Inside a <label>, don't toggle the associated input. Taps (which also fire
          // mouseenter on touch screens) just open it; tapping elsewhere closes it.
          e.preventDefault();
          show();
        }}
        className="inline-grid place-items-center w-4 h-4 rounded-full text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 align-middle"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ top: pos.top, left: pos.left, width: WIDTH, transform: pos.above ? "translateY(-100%)" : undefined }}
            className="fixed z-[60] rounded-xl border border-border bg-card px-3 py-2 text-xs leading-relaxed text-foreground shadow-card pointer-events-none"
          >
            <p className="font-semibold mb-0.5">{label}</p>
            <div className="text-muted">{children}</div>
          </div>,
          document.body
        )}
    </>
  );
}
