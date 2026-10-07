import YahooFinance from "yahoo-finance2";

/**
 * Daily-chart technicals for the top-down routine: moving averages, RSI and a
 * trend read on daily, weekly and monthly bars. Cached in memory for 15 minutes.
 */

export type Trend = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface Technicals {
  symbol: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  ema9: number | null;
  sma20: number | null;
  sma50: number | null;
  sma100: number | null;
  sma200: number | null;
  rsi14: number | null;
  trend: { daily: Trend | null; weekly: Trend | null; monthly: Trend | null };
  /** Majority of the three timeframe trends. */
  suggested: Trend | null;
}

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const TTL_MS = 15 * 60_000;
const cache = new Map<string, { at: number; value: Technicals }>();

const round = (v: number | null, d = 2) => (v == null ? null : Number(v.toFixed(d)));

export function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) sum += values[i];
  return sum / n;
}

export function ema(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const k = 2 / (n + 1);
  let e = sma(values.slice(0, n), n)!;
  for (let i = n; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

/** Wilder's RSI. */
export function rsi(values: number[], n = 14): number | null {
  if (values.length <= n) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/**
 * Trend on a close series: price above a rising average is bullish, below a
 * falling one is bearish, anything else is neutral.
 */
export function trendOf(closes: number[], n: number): Trend | null {
  if (closes.length < n + 5) return null;
  const now = sma(closes, n)!;
  const before = sma(closes.slice(0, -5), n)!;
  const last = closes[closes.length - 1];
  if (last > now && now > before) return "BULLISH";
  if (last < now && now < before) return "BEARISH";
  return "NEUTRAL";
}

/** Last close of each week (ISO week starting Monday) or month. */
function resample(bars: { date: Date; close: number }[], by: "week" | "month"): number[] {
  const out: number[] = [];
  let key = "";
  for (const b of bars) {
    const d = b.date;
    const k =
      by === "month"
        ? `${d.getUTCFullYear()}-${d.getUTCMonth()}`
        : String(Math.floor((d.getTime() / 86_400_000 + 3) / 7)); // epoch was a Thursday
    if (k === key) out[out.length - 1] = b.close;
    else {
      out.push(b.close);
      key = k;
    }
  }
  return out;
}

async function compute(symbol: string): Promise<Technicals> {
  const chart = (await yf.chart(
    symbol,
    { period1: new Date(Date.now() - 3 * 365 * 86_400_000), interval: "1d" },
    { validateResult: false }
  )) as { quotes?: { date: Date | string; close?: number | null; volume?: number | null }[] };

  const bars = (chart.quotes ?? [])
    .filter((q) => typeof q.close === "number")
    .map((q) => ({ date: new Date(q.date), close: q.close as number, volume: q.volume ?? null }));
  const closes = bars.map((b) => b.close);
  const last = closes.at(-1) ?? null;
  const prev = closes.at(-2) ?? null;

  const trend = {
    daily: trendOf(closes, 20),
    weekly: trendOf(resample(bars, "week"), 10),
    monthly: trendOf(resample(bars, "month"), 10),
  };
  const votes = Object.values(trend).filter((t): t is Trend => t != null);
  const count = (t: Trend) => votes.filter((v) => v === t).length;
  const suggested: Trend | null = !votes.length
    ? null
    : count("BULLISH") >= 2
      ? "BULLISH"
      : count("BEARISH") >= 2
        ? "BEARISH"
        : "NEUTRAL";

  return {
    symbol,
    price: round(last),
    changePct: last != null && prev ? round(((last - prev) / prev) * 100) : null,
    volume: bars.at(-1)?.volume ?? null,
    ema9: round(ema(closes, 9)),
    sma20: round(sma(closes, 20)),
    sma50: round(sma(closes, 50)),
    sma100: round(sma(closes, 100)),
    sma200: round(sma(closes, 200)),
    rsi14: round(rsi(closes, 14), 1),
    trend,
    suggested,
  };
}

/** Technicals for each Yahoo symbol; symbols that fail are omitted. */
export async function getTechnicals(symbols: string[]): Promise<Record<string, Technicals>> {
  const now = Date.now();
  const out: Record<string, Technicals> = {};
  await Promise.all(
    symbols.map(async (symbol) => {
      const hit = cache.get(symbol);
      if (hit && now - hit.at < TTL_MS) {
        out[symbol] = hit.value;
        return;
      }
      try {
        const value = await compute(symbol);
        cache.set(symbol, { at: now, value });
        out[symbol] = value;
      } catch (err) {
        console.warn(`[technicals] ${symbol} failed:`, err instanceof Error ? err.message : err);
        if (hit) out[symbol] = hit.value;
      }
    })
  );
  return out;
}
