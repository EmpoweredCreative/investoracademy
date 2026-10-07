/** The six steps of the top-down market routine (Trader's Corner landing). */
export const ROUTINE_STEPS = [
  { key: "chart", title: "Start With the Chart", quote: "Everything that is known, or possibly knowable, gets priced into the market in real time." },
  { key: "pulse", title: "Keep Your Finger on the Pulse", quote: "Many market pundits talk, but only a few have something valuable to say." },
  { key: "business", title: "Take Care of Your Business", quote: "Keep your mind on your money and your money on your mind." },
  { key: "opportunities", title: "Find New Opportunities", quote: "Patience is a conquering virtue." },
  { key: "journal", title: "Update Your Journal", quote: "Show me an organized trading journal and I'll show you a disciplined trader." },
  { key: "blueprint", title: "Review Your Blueprint", quote: "Design the life you want." },
] as const;

export type RoutineStepKey = (typeof ROUTINE_STEPS)[number]["key"];

export const ROUTINE_STEP_KEYS = ROUTINE_STEPS.map((s) => s.key) as RoutineStepKey[];

/** The blueprint review is weekly; it's due when not marked done in this many days. */
export const BLUEPRINT_INTERVAL_DAYS = 7;

/** Local calendar date as YYYY-MM-DD (routine days follow the user's clock, not UTC). */
export function localDateStr(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
