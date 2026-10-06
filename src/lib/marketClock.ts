/**
 * US equity market session in New York time (weekdays 9:30–16:00 ET).
 * Exchange holidays are not modeled; Schwab/Yahoo market state can refine this later.
 */
export type MarketPhase = "PRE" | "OPEN" | "AFTER" | "CLOSED";

export interface MarketStatus {
  phase: MarketPhase;
  label: string;
  /** Milliseconds until the next phase change (open or close). */
  msToNext: number;
  nextLabel: string;
  /** Current time in New York as HH:MM:SS. */
  nyTime: string;
}

const NY = "America/New_York";

function nyParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = parseInt(get("hour"), 10) % 24;
  return {
    weekday: get("weekday"),
    hour,
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
  };
}

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const PRE_MIN = 4 * 60;
const AFTER_END_MIN = 20 * 60;

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const { weekday, hour, minute, second } = nyParts(now);
  const nyTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  const secOfDay = hour * 3600 + minute * 60 + second;
  const minOfDay = hour * 60 + minute;
  const isWeekend = weekday === "Sat" || weekday === "Sun";

  const msUntilMinute = (targetMin: number, daysAhead = 0) =>
    ((daysAhead * 24 * 3600 + targetMin * 60 - secOfDay) * 1000);

  if (!isWeekend && minOfDay >= OPEN_MIN && minOfDay < CLOSE_MIN) {
    return { phase: "OPEN", label: "Market open", msToNext: msUntilMinute(CLOSE_MIN), nextLabel: "closes", nyTime };
  }

  // Days until the next weekday open
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dow = order.indexOf(weekday);
  let daysAhead = 0;
  if (isWeekend || minOfDay >= CLOSE_MIN) {
    daysAhead = 1;
    while ([0, 6].includes((dow + daysAhead) % 7)) daysAhead++;
  }
  const msToOpen = msUntilMinute(OPEN_MIN, daysAhead);

  if (!isWeekend && minOfDay >= PRE_MIN && minOfDay < OPEN_MIN) {
    return { phase: "PRE", label: "Pre-market", msToNext: msToOpen, nextLabel: "opens", nyTime };
  }
  if (!isWeekend && minOfDay >= CLOSE_MIN && minOfDay < AFTER_END_MIN) {
    return { phase: "AFTER", label: "After hours", msToNext: msToOpen, nextLabel: "opens", nyTime };
  }
  return { phase: "CLOSED", label: "Market closed", msToNext: msToOpen, nextLabel: "opens", nyTime };
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
