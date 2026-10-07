/** Eastern-time helpers shared by server and browser. */

/** Epoch ms for an ET calendar date + "8:30 AM"-style time (null for "All day"). */
export function eventInstant(date: string, time: string): number | null {
  const m = time.match(/(\d+):(\d+) (AM|PM)/);
  if (!m) return null;
  const hour = (Number(m[1]) % 12) + (m[3] === "PM" ? 12 : 0);
  const offset = new Date(`${date}T12:00:00Z`)
    .toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .match(/GMT([+-]\d+)/)?.[1];
  const off = Number(offset ?? -5);
  const sign = off < 0 ? "-" : "+";
  return Date.parse(`${date}T${String(hour).padStart(2, "0")}:${m[2]}:00${sign}${String(Math.abs(off)).padStart(2, "0")}:00`);
}

/** "in 3h 12m", "in 2d 4h", "now". */
export function countdownLabel(ms: number): string {
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const min = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h === 0) return `in ${min}m`;
  return `in ${h}h ${min}m`;
}
