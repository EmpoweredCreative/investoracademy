import { unstable_cache } from "next/cache";
import { eventInstant } from "./etTime";
import {
  byDateTime,
  fred,
  fredConfigured,
  getCalendar,
  observations,
  type CalendarEvent,
  type Point,
} from "./fred";

/**
 * Economic calendar with previous / expected / actual for each release.
 *
 * - This week: Forex Factory's public feed supplies events, consensus forecasts
 *   and previous values (it only publishes the current week).
 * - Later weeks: FRED's release schedule plus FOMC dates, with the previous value
 *   computed from FRED. Forecasts appear once the release's week begins.
 * - Actuals: once FRED has updated the series after the release time, the new
 *   value is computed from FRED in the same units Forex Factory uses.
 */

const FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
/** Forex Factory rate-limits hard (429 after a few requests), so fetch at most hourly. */
const FF_REVALIDATE_S = 3600;
const SERIES_META_TTL_MS = 10 * 60_000;
const TZ = "America/New_York";

type Calc = "mm" | "yy" | "diffK" | "levelK" | "levelM" | "pct1" | "pct2";

interface Measure {
  series: string;
  calc: Calc;
}

/** Forex Factory event titles we can compute from FRED. */
const MEASURES: Record<string, Measure> = {
  "CPI m/m": { series: "CPIAUCSL", calc: "mm" },
  "Core CPI m/m": { series: "CPILFESL", calc: "mm" },
  "CPI y/y": { series: "CPIAUCSL", calc: "yy" },
  "Core CPI y/y": { series: "CPILFESL", calc: "yy" },
  "PPI m/m": { series: "PPIFIS", calc: "mm" },
  "Core PPI m/m": { series: "PPIFES", calc: "mm" },
  "Non-Farm Employment Change": { series: "PAYEMS", calc: "diffK" },
  "Unemployment Rate": { series: "UNRATE", calc: "pct1" },
  "Average Hourly Earnings m/m": { series: "CES0500000003", calc: "mm" },
  "Core PCE Price Index m/m": { series: "PCEPILFE", calc: "mm" },
  "Advance GDP q/q": { series: "A191RL1Q225SBEA", calc: "pct1" },
  "Prelim GDP q/q": { series: "A191RL1Q225SBEA", calc: "pct1" },
  "Final GDP q/q": { series: "A191RL1Q225SBEA", calc: "pct1" },
  "GDP q/q": { series: "A191RL1Q225SBEA", calc: "pct1" },
  "Unemployment Claims": { series: "ICSA", calc: "levelK" },
  "JOLTS Job Openings": { series: "JTSJOL", calc: "levelM" },
  "Retail Sales m/m": { series: "RSAFS", calc: "mm" },
  "Core Retail Sales m/m": { series: "RSFSXMV", calc: "mm" },
  "Federal Funds Rate": { series: "DFEDTARU", calc: "pct2" },
};

/** Headline line for each FRED release, used for weeks Forex Factory doesn't cover yet. */
const RELEASE_HEADLINES: Record<number, string> = {
  9: "Retail Sales m/m",
  10: "CPI m/m",
  46: "PPI m/m",
  50: "Non-Farm Employment Change",
  53: "GDP q/q",
  54: "Core PCE Price Index m/m",
  180: "Unemployment Claims",
  192: "JOLTS Job Openings",
};

/** Forex Factory events that aren't useful on the calendar. */
const SKIP = /speaks|bond auction|bank holiday|currency report|crude oil inventories|natural gas/i;

interface FfEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
}

const metaCache = new Map<string, { at: number; lastUpdated: number }>();

/**
 * This week's Forex Factory feed, shared across server instances through Next's
 * data cache. A failed refresh throws, so the last good copy keeps being served.
 */
const cachedForexFactoryWeek = unstable_cache(
  async (): Promise<FfEvent[]> => {
    const res = await fetch(FF_URL, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 WealthOS" } });
    if (!res.ok) throw new Error(`Forex Factory ${res.status}`);
    return (await res.json()) as FfEvent[];
  },
  ["forex-factory-week"],
  { revalidate: FF_REVALIDATE_S }
);

async function forexFactoryWeek(): Promise<FfEvent[]> {
  try {
    return await cachedForexFactoryWeek();
  } catch (err) {
    console.warn("[econCalendar] Forex Factory feed unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Actuals from TradingView's economic calendar feed ───────

/**
 * TradingView's public calendar feed (the one behind its calendar widget)
 * publishes actuals within minutes of a release, including surveys FRED doesn't
 * carry (ISM, consumer sentiment). Unofficial, so everything falls back to FRED.
 */
const TV_URL = "https://economic-calendar.tradingview.com/events";

interface TvEvent {
  title: string;
  date: string; // ISO
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  unit?: string | null;
  scale?: string | null;
}

const cachedTvRange = unstable_cache(
  async (from: string, to: string): Promise<TvEvent[]> => {
    const qs = new URLSearchParams({ from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.000Z`, countries: "US" });
    const res = await fetch(`${TV_URL}?${qs}`, {
      cache: "no-store",
      headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0 WealthOS" },
    });
    if (!res.ok) throw new Error(`TradingView calendar ${res.status}`);
    const json = (await res.json()) as { result?: TvEvent[] };
    return json.result ?? [];
  },
  ["tradingview-econ"],
  { revalidate: 300 }
);

async function tvRange(from: string, to: string): Promise<TvEvent[]> {
  try {
    return await cachedTvRange(from, to);
  } catch (err) {
    console.warn("[econCalendar] TradingView calendar unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Forex Factory and TradingView name the same releases differently. */
const ALIASES: [RegExp, string][] = [
  [/\bunemployment claims\b/g, "initial jobless claims"],
  [/\bnon-?farm employment change\b/g, "non farm payrolls"],
  [/\bcore cpi\b/g, "core inflation rate"],
  [/\bcpi\b/g, "inflation rate"],
  [/\buom\b/g, "michigan"],
  [/\bprelim\b/g, "prel"],
  [/\brevised\b/g, "final"],
  [/\bfomc meeting minutes\b/g, "fomc minutes"],
  [/\bfederal funds rate\b/g, "fed interest rate decision"],
  [/\badvance gdp\b/g, "gdp growth rate adv"],
  [/\bprel gdp\b/g, "gdp growth rate second estimate"],
  [/\bfinal gdp\b/g, "gdp growth rate final"],
  [/\bm\/m\b/g, "mom"],
  [/\by\/y\b/g, "yoy"],
  [/\bq\/q\b/g, "qoq"],
];

function tokens(title: string): Set<string> {
  let t = title.toLowerCase();
  for (const [re, to] of ALIASES) t = t.replace(re, to);
  return new Set(t.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !["the", "of", "and", "us"].includes(w)));
}

/** The TradingView event for a release: same time (±30 min) and the closest name. */
export function matchTvEvent(title: string, atMs: number, tv: TvEvent[]): TvEvent | null {
  const want = tokens(title);
  let best: { e: TvEvent; score: number } | null = null;
  for (const e of tv) {
    if (Math.abs(Date.parse(e.date) - atMs) > 30 * 60_000) continue;
    const have = tokens(e.title);
    const inter = [...want].filter((w) => have.has(w)).length;
    const score = inter / (want.size + have.size - inter);
    if (score > (best?.score ?? 0)) best = { e, score };
  }
  return best && best.score >= 0.5 ? best.e : null;
}

/** "54.9", "0.3%", "200K", "$-105.6B" in Forex Factory style. */
export function formatTvValue(v: number | null, unit?: string | null, scale?: string | null): string | null {
  if (v == null) return null;
  const n = Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
  return `${unit === "$" ? "$" : ""}${n}${unit === "%" ? "%" : ""}${scale ?? ""}`;
}

/** Give `value` the same unit suffix (%, K, M, B) as `sample` when it's missing one. */
export function likeSample(value: string | null, sample: string | null | undefined): string | null {
  if (!value || !sample) return value;
  const suffix = sample.trim().match(/(%|[KMB])$/i)?.[1];
  return suffix && !value.trim().toUpperCase().endsWith(suffix.toUpperCase()) ? `${value}${suffix}` : value;
}

/** When FRED last updated a series (ms since epoch). */
async function lastUpdated(series: string): Promise<number> {
  const hit = metaCache.get(series);
  if (hit && Date.now() - hit.at < SERIES_META_TTL_MS) return hit.lastUpdated;
  const json = await fred<{ seriess: { last_updated: string }[] }>("series", { series_id: series });
  // "2026-10-02 08:24:33-05" → ISO
  const raw = json.seriess[0]?.last_updated ?? "";
  const lastUpdated = Date.parse(raw.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")) || 0;
  metaCache.set(series, { at: Date.now(), lastUpdated });
  return lastUpdated;
}

const pct = (v: number, d: number) => `${v.toFixed(d)}%`;

/** Value of a measure at observation index i (negative counts from the end). */
function compute(points: Point[], calc: Calc, i: number): string | null {
  const at = (k: number) => points.at(k)?.value ?? null;
  const cur = at(i);
  if (cur == null) return null;
  switch (calc) {
    case "mm": {
      const prev = at(i - 1);
      return prev ? pct(((cur - prev) / prev) * 100, 1) : null;
    }
    case "yy": {
      const p = points.at(i)!;
      const [y, m] = p.date.split("-");
      const prior = points.find((x) => x.date === `${Number(y) - 1}-${m}-01`)?.value;
      return prior ? pct(((cur - prior) / prior) * 100, 1) : null;
    }
    case "diffK": {
      const prev = at(i - 1);
      return prev != null ? `${Math.round(cur - prev)}K` : null;
    }
    case "levelK":
      return `${Math.round(cur / 1000)}K`;
    case "levelM":
      return `${(cur / 1000).toFixed(2)}M`;
    case "pct1":
      return pct(cur, 1);
    case "pct2":
      return pct(cur, 2);
  }
}

/** A measure's value from FRED by Forex Factory title (offset -1 = latest, -2 = prior). */
export async function measureValue(title: string, offset = -1): Promise<string | null> {
  const measure = MEASURES[title];
  return measure ? latest(measure, offset) : null;
}

/** Latest FRED value of a measure, refetching if the series changed since our cache. */
async function latest(measure: Measure, offset = -1): Promise<string | null> {
  const updated = await lastUpdated(measure.series);
  const points = await observations(measure.series, updated);
  return compute(points, measure.calc, offset);
}

function etParts(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-CA", { timeZone: TZ });
  const time = d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  return { date, time: time === "12:00 AM" ? "All day" : time };
}

/** Monday of the current week in ET, as YYYY-MM-DD. */
export function weekStartET(now = new Date()): string {
  const today = new Date(now.toLocaleDateString("en-CA", { timeZone: TZ }) + "T12:00:00Z");
  const dow = today.getUTCDay(); // 0 = Sunday
  today.setUTCDate(today.getUTCDate() - ((dow + 6) % 7));
  return today.toISOString().slice(0, 10);
}

/** Calendar from `from` (YYYY-MM-DD) through `daysAhead` days from today. */
export async function getEconomicCalendar(from: string, daysAhead: number): Promise<CalendarEvent[]> {
  const to = new Date(Date.now() + daysAhead * 86_400_000).toLocaleDateString("en-CA", { timeZone: TZ });
  const withFred = fredConfigured();
  const now = Date.now();

  const [ff, fredEvents, tv] = await Promise.all([
    forexFactoryWeek(),
    getCalendar(from, to).catch(() => [] as CalendarEvent[]),
    tvRange(from, to),
  ]);

  // This week, from Forex Factory.
  const ffUsd = ff.filter((e) => e.country === "USD" && (e.impact === "High" || e.impact === "Medium") && !SKIP.test(e.title));
  const ffDates = ff.map((e) => etParts(e.date).date).sort();
  const [ffStart, ffEnd] = [ffDates[0], ffDates.at(-1)];

  const thisWeek = await Promise.all(
    ffUsd.map(async (e): Promise<CalendarEvent> => {
      const { date, time } = etParts(e.date);
      const measure = MEASURES[e.title];
      const match = matchTvEvent(e.title, Date.parse(e.date), tv);
      let actual: string | null = Date.parse(e.date) <= now ? formatTvValue(match?.actual ?? null, match?.unit, match?.scale) : null;
      if (!actual && withFred && measure && Date.parse(e.date) <= now) {
        try {
          // Only count FRED's latest value as this release's actual if FRED updated after the release.
          if ((await lastUpdated(measure.series)) >= Date.parse(e.date)) actual = await latest(measure);
        } catch {
          /* leave actual empty */
        }
      }
      return {
        date,
        time,
        label: e.title,
        kind: /FOMC|Federal Funds/i.test(e.title) ? "fomc" : "release",
        high: e.impact === "High",
        previous: e.previous || formatTvValue(match?.previous ?? null, match?.unit, match?.scale),
        forecast: e.forecast || formatTvValue(match?.forecast ?? null, match?.unit, match?.scale),
        actual: likeSample(actual, e.forecast || e.previous),
      };
    })
  );

  // Later weeks (and this week if the feed is unavailable), from FRED + FOMC dates.
  const outsideFf = fredEvents.filter((e) => !ffStart || e.date < ffStart || e.date > ffEnd!);
  const later = await Promise.all(
    outsideFf.map(async (e): Promise<CalendarEvent> => {
      const title = e.kind === "fomc" ? "Federal Funds Rate" : RELEASE_HEADLINES[e.releaseId ?? -1];
      const measure = title ? MEASURES[title] : undefined;
      let previous: string | null = null;
      if (withFred && measure) {
        try {
          previous = await latest(measure);
        } catch {
          /* leave previous empty */
        }
      }
      // TradingView often has forecasts for later weeks before Forex Factory publishes them.
      const at = eventInstant(e.date, e.time);
      const match = at != null && title ? matchTvEvent(title, at, tv) : null;
      return {
        ...e,
        label: title ?? e.label,
        high: true,
        previous: previous ?? formatTvValue(match?.previous ?? null, match?.unit, match?.scale),
        forecast: formatTvValue(match?.forecast ?? null, match?.unit, match?.scale),
        actual: at != null && at <= now ? formatTvValue(match?.actual ?? null, match?.unit, match?.scale) : null,
      };
    })
  );

  return [...thisWeek, ...later].filter((e) => e.date >= from && e.date <= to).sort(byDateTime);
}

/**
 * Releases for the top bar: today's high-impact events (released ones keep their
 * actual for the rest of the day) plus anything high-impact in the next 48 hours.
 */
export async function getHeadlineEvents(now = Date.now(), limit = 6) {
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: TZ });
  const events = await getEconomicCalendar(weekStartET(new Date(now)), 3);
  return events
    .filter((e) => e.high)
    .map((e) => ({ ...e, at: eventInstant(e.date, e.time) }))
    .filter((e): e is typeof e & { at: number } => e.at != null && (e.date === today || (e.at >= now && e.at <= now + 48 * 3_600_000)))
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((e) => ({ ...e, at: new Date(e.at).toISOString() }));
}
