/**
 * Capital used: the buying power effect (BPE) tied up in open positions, and
 * monthly ROI on it. BPE comes from Schwab or the trade ticket when available,
 * otherwise from standard margin rules (always labeled an estimate).
 */

export interface OptionPosition {
  id: string;
  groupId: string | null; // multi-leg strategies share a group
  strategyType: string | null;
  callPut: "CALL" | "PUT" | null;
  longShort: "LONG" | "SHORT" | null;
  strike: number | null;
  quantity: number;
  openedAt: string; // ISO
  closedAt: string | null; // ISO
  bpe: number | null;
  /** Opening premium for this leg: + credit received, − debit paid. */
  premium: number;
}

export interface StockPosition {
  openedAt: string; // ISO (lot acquired)
  shares: number;
  cost: number;
  /** Broker margin requirement for this lot's shares, if known. */
  marginRequirement: number | null;
}

/** Reg T style rates used when the broker's number isn't available. */
export const NAKED_RATE = 0.2;
export const STOCK_RATE = 0.5;

export interface CapitalItem {
  key: string;
  openedAt: string;
  closedAt: string | null;
  bpe: number;
  estimated: boolean;
}

/** Estimated BPE for one strategy (all its legs). */
export function estimateBpe(legs: OptionPosition[]): number {
  const type = legs[0]?.strategyType;
  const shorts = legs.filter((l) => l.longShort === "SHORT");
  const longs = legs.filter((l) => l.longShort === "LONG");
  const qty = Math.max(...legs.map((l) => l.quantity), 1);
  const credit = legs.reduce((s, l) => s + l.premium, 0);

  // Defined-risk spreads: widest side × 100 − net credit.
  if (shorts.length && longs.length && legs.every((l) => l.strike != null)) {
    let width = 0;
    for (const side of ["PUT", "CALL"] as const) {
      const s = shorts.filter((l) => l.callPut === side).map((l) => l.strike!);
      const l = longs.filter((x) => x.callPut === side).map((x) => x.strike!);
      if (s.length && l.length) width = Math.max(width, Math.abs(Math.max(...s) - Math.max(...l)));
    }
    if (width > 0) return Math.max(0, width * 100 * qty - Math.max(0, credit));
  }
  if (type === "COVERED_CALL") return 0; // the shares already carry the margin
  if (shorts.length) {
    const maxStrike = Math.max(...shorts.map((l) => l.strike ?? 0));
    return NAKED_RATE * maxStrike * 100 * qty;
  }
  // Long options and debit trades: the premium paid is the capital used.
  return Math.max(0, -credit);
}

/** One capital item per strategy (legs grouped), preferring broker/ticket BPE. */
export function capitalItems(options: OptionPosition[], stocks: StockPosition[]): CapitalItem[] {
  const groups = new Map<string, OptionPosition[]>();
  for (const o of options) {
    const k = o.groupId ?? o.id;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const items: CapitalItem[] = [];
  for (const [key, legs] of groups) {
    const known = legs.filter((l) => l.bpe != null);
    const bpe = known.length ? known.reduce((s, l) => s + l.bpe!, 0) : estimateBpe(legs);
    const opened = legs.map((l) => l.openedAt).sort()[0];
    const closes = legs.map((l) => l.closedAt);
    const closedAt = closes.some((c) => c == null) ? null : closes.sort().at(-1)!;
    items.push({ key, openedAt: opened, closedAt, bpe, estimated: known.length === 0 });
  }
  stocks.forEach((s, i) =>
    items.push({
      key: `stock:${i}`,
      openedAt: s.openedAt,
      closedAt: null,
      bpe: s.marginRequirement ?? s.cost * STOCK_RATE,
      estimated: s.marginRequirement == null,
    })
  );
  return items;
}

/** Average capital in use over a month's days (up to `today` for the current month). */
export function averageCapital(items: CapitalItem[], month: string, today: string): { average: number; estimatedShare: number } {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastDay = today.slice(0, 7) === month ? Number(today.slice(8, 10)) : daysInMonth;
  if (today.slice(0, 7) < month) return { average: 0, estimatedShare: 0 };
  let total = 0;
  let estimated = 0;
  for (let d = 1; d <= lastDay; d++) {
    const day = `${month}-${String(d).padStart(2, "0")}`;
    for (const it of items) {
      const open = it.openedAt.slice(0, 10) <= day && (it.closedAt == null || it.closedAt.slice(0, 10) > day);
      if (!open) continue;
      total += it.bpe;
      if (it.estimated) estimated += it.bpe;
    }
  }
  return { average: total / lastDay, estimatedShare: total > 0 ? estimated / total : 0 };
}

/** Monthly ROI on capital used, and its simple annualized rate. */
export function monthlyRoi(income: number, averageCapitalUsed: number) {
  if (averageCapitalUsed <= 0) return null;
  const roi = income / averageCapitalUsed;
  return { roi, annualized: roi * 12 };
}
