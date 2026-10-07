/**
 * Economic data from FRED (St. Louis Fed): inflation, jobs, Fed policy, Treasury
 * yields and the upcoming release calendar. Requires FRED_API_KEY (free at
 * https://fred.stlouisfed.org/docs/api/api_key.html). Cached in memory.
 */

const BASE = "https://api.stlouisfed.org/fred";
const SERIES_TTL_MS = 6 * 3600_000;
const CALENDAR_TTL_MS = 12 * 3600_000;

export type Transform = "level" | "yoy";

export interface IndicatorDef {
  key: string;
  label: string;
  description: string;
  series: string;
  transform: Transform;
  /** FRED release that publishes this series. */
  releaseId?: number;
  frequency: "daily" | "monthly";
}

/** Headline indicators shown in Step 2 and on the Economy page. */
export const INDICATORS: IndicatorDef[] = [
  { key: "cpi", label: "CPI", description: "Consumer prices, year over year", series: "CPIAUCSL", transform: "yoy", releaseId: 10, frequency: "monthly" },
  { key: "coreCpi", label: "Core CPI", description: "CPI ex food & energy, y/y", series: "CPILFESL", transform: "yoy", releaseId: 10, frequency: "monthly" },
  { key: "ppi", label: "PPI", description: "Producer prices (final demand), y/y", series: "PPIFIS", transform: "yoy", releaseId: 46, frequency: "monthly" },
  { key: "corePce", label: "Core PCE", description: "The Fed's preferred inflation gauge, y/y", series: "PCEPILFE", transform: "yoy", releaseId: 54, frequency: "monthly" },
  { key: "unemployment", label: "Unemployment", description: "Unemployment rate", series: "UNRATE", transform: "level", releaseId: 50, frequency: "monthly" },
  { key: "fedFunds", label: "Fed Funds", description: "Target range upper bound", series: "DFEDTARU", transform: "level", frequency: "daily" },
  { key: "fedFundsLower", label: "Fed Funds (lower)", description: "Target range lower bound", series: "DFEDTARL", transform: "level", frequency: "daily" },
  { key: "effr", label: "Effective Fed Funds", description: "Effective federal funds rate", series: "EFFR", transform: "level", frequency: "daily" },
];

/** Treasury constant-maturity yields, short to long. */
export const YIELDS: IndicatorDef[] = [
  { key: "y3m", label: "3M", description: "3-month Treasury bill", series: "DGS3MO", transform: "level", frequency: "daily" },
  { key: "y2", label: "2Y", description: "2-year Treasury", series: "DGS2", transform: "level", frequency: "daily" },
  { key: "y5", label: "5Y", description: "5-year Treasury", series: "DGS5", transform: "level", frequency: "daily" },
  { key: "y10", label: "10Y", description: "10-year Treasury", series: "DGS10", transform: "level", frequency: "daily" },
  { key: "y30", label: "30Y", description: "30-year Treasury", series: "DGS30", transform: "level", frequency: "daily" },
  { key: "t10y2y", label: "2s10s", description: "10-year minus 2-year spread", series: "T10Y2Y", transform: "level", frequency: "daily" },
];

/** Yahoo tickers for intraday yields (FRED publishes daily, a day late). */
export const YAHOO_YIELDS: Record<string, string> = { y3m: "^IRX", y5: "^FVX", y10: "^TNX", y30: "^TYX" };

/** Releases tracked on the calendar, with their usual release time (ET). */
export const TRACKED_RELEASES: Record<number, { label: string; time: string }> = {
  9: { label: "Retail Sales", time: "8:30 AM" },
  10: { label: "CPI", time: "8:30 AM" },
  46: { label: "PPI", time: "8:30 AM" },
  50: { label: "Jobs Report", time: "8:30 AM" },
  53: { label: "GDP", time: "8:30 AM" },
  54: { label: "PCE / Personal Income", time: "8:30 AM" },
  180: { label: "Jobless Claims", time: "8:30 AM" },
  192: { label: "JOLTS", time: "10:00 AM" },
};

/** FOMC decision days (second day of each meeting). FRED doesn't publish these. */
export const FOMC_DECISIONS = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
];

export interface Point {
  date: string;
  value: number;
}

export interface Reading {
  key: string;
  label: string;
  description: string;
  date: string;
  value: number;
  previous: number | null;
}

export interface CalendarEvent {
  date: string;
  label: string;
  time: string;
  kind: "release" | "fomc";
  /** FRED release id (FRED-sourced events only). */
  releaseId?: number;
  /** Market-moving (Forex Factory "High" impact, or a tracked headline release). */
  high?: boolean;
  previous?: string | null;
  forecast?: string | null;
  actual?: string | null;
}

export class FredNotConfiguredError extends Error {
  constructor() {
    super("FRED_API_KEY is not set");
  }
}

export const fredConfigured = () => Boolean(process.env.FRED_API_KEY);

const seriesCache = new Map<string, { at: number; points: Point[] }>();
let calendarCache: { at: number; events: CalendarEvent[] } | null = null;

export async function fred<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new FredNotConfiguredError();
  const qs = new URLSearchParams({ ...params, api_key: key, file_type: "json" });
  const res = await fetch(`${BASE}/${path}?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`FRED ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** Raw observations for a series over the last ~3 years (missing values dropped). */
export async function observations(series: string, freshAfter = 0): Promise<Point[]> {
  const hit = seriesCache.get(series);
  if (hit && Date.now() - hit.at < SERIES_TTL_MS && hit.at > freshAfter) return hit.points;
  try {
    const json = await fred<{ observations: { date: string; value: string }[] }>("series/observations", {
      series_id: series,
      observation_start: isoDaysAgo(3 * 366),
    });
    const points = json.observations
      .map((o) => ({ date: o.date, value: Number(o.value) }))
      .filter((p) => Number.isFinite(p.value));
    seriesCache.set(series, { at: Date.now(), points });
    return points;
  } catch (err) {
    if (hit) return hit.points;
    throw err;
  }
}

export function transform(points: Point[], t: Transform): Point[] {
  if (t === "level") return points;
  // Monthly index → percent change vs the same month a year earlier.
  const byMonth = new Map(points.map((p) => [p.date.slice(0, 7), p.value]));
  return points.flatMap((p) => {
    const [y, m] = p.date.split("-");
    const prior = byMonth.get(`${Number(y) - 1}-${m}`);
    return prior ? [{ date: p.date, value: Number((((p.value - prior) / prior) * 100).toFixed(2)) }] : [];
  });
}

/** Transformed history for an indicator, trimmed to the last `days`. */
export async function getHistory(def: IndicatorDef, days = 2 * 366): Promise<Point[]> {
  const cutoff = isoDaysAgo(days);
  return transform(await observations(def.series), def.transform).filter((p) => p.date >= cutoff);
}

async function reading(def: IndicatorDef): Promise<Reading | null> {
  const points = transform(await observations(def.series), def.transform);
  const last = points.at(-1);
  if (!last) return null;
  return {
    key: def.key,
    label: def.label,
    description: def.description,
    date: last.date,
    value: last.value,
    previous: points.at(-2)?.value ?? null,
  };
}

/** Latest reading for every indicator and yield. Indicators that fail are omitted. */
export async function getReadings(): Promise<Record<string, Reading>> {
  const defs = [...INDICATORS, ...YIELDS];
  const results = await Promise.allSettled(defs.map(reading));
  const out: Record<string, Reading> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) out[defs[i].key] = r.value;
    else if (r.status === "rejected" && r.reason instanceof FredNotConfiguredError) throw r.reason;
  });
  return out;
}

/** Value of a series on or before a date. */
function valueAsOf(points: Point[], date: string): number | null {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].date <= date) return points[i].value;
  return null;
}

/** Yield curve (3M → 30Y) today, a month ago and a year ago. */
export async function getYieldCurve() {
  const tenors = YIELDS.filter((y) => y.key !== "t10y2y");
  const series = await Promise.all(tenors.map((t) => observations(t.series)));
  const latest = series[0].at(-1)?.date ?? isoDaysAgo(0);
  const shift = (days: number) => new Date(new Date(latest).getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const curve = (date: string) => ({
    date,
    points: tenors.map((t, i) => ({ tenor: t.label, value: valueAsOf(series[i], date) })),
  });
  return [curve(latest), curve(shift(30)), curve(shift(365))];
}

/** Tracked FRED releases and FOMC decisions between two dates (YYYY-MM-DD, inclusive). */
export async function getCalendar(from: string, to: string): Promise<CalendarEvent[]> {
  const today = isoDaysAgo(0);

  let events = calendarCache && Date.now() - calendarCache.at < CALENDAR_TTL_MS ? calendarCache.events : null;
  if (!events && !fredConfigured()) events = [];
  if (!events) {
    const json = await fred<{ release_dates: { release_id: number; date: string }[] }>("releases/dates", {
      realtime_start: from < today ? from : today,
      realtime_end: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
      include_release_dates_with_no_data: "true",
      sort_order: "asc",
      limit: "1000",
    });
    const seen = new Set<string>();
    events = json.release_dates.flatMap((r) => {
      const meta = TRACKED_RELEASES[r.release_id];
      const id = `${r.release_id}:${r.date}`;
      if (!meta || seen.has(id)) return [];
      seen.add(id);
      return [{ date: r.date, label: meta.label, time: meta.time, kind: "release" as const, releaseId: r.release_id }];
    });
    calendarCache = { at: Date.now(), events };
  }

  const fomc: CalendarEvent[] = FOMC_DECISIONS.map((date) => ({
    date,
    label: "FOMC Rate Decision",
    time: "2:00 PM",
    kind: "fomc",
  }));
  return [...events, ...fomc]
    .filter((e) => e.date >= from && e.date <= to)
    .sort(byDateTime);
}

export const byDateTime = (a: CalendarEvent, b: CalendarEvent) =>
  a.date.localeCompare(b.date) || minutes(a.time) - minutes(b.time);

/** "8:30 AM" → minutes after midnight, for ordering same-day events. */
function minutes(time: string): number {
  const match = time.match(/(\d+):(\d+) (AM|PM)/);
  if (!match) return -1; // "All day" sorts first
  const [, h, m, ap] = match;
  return ((Number(h) % 12) + (ap === "PM" ? 12 : 0)) * 60 + Number(m);
}
