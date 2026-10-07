"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards. Use it to render
 * time-of-day text (clocks, "Good morning", today's date) only in the browser,
 * so the server's time zone never causes a hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
