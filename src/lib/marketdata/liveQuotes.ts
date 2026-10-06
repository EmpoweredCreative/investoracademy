import YahooFinance from "yahoo-finance2";

/**
 * Batched, short-lived cached quotes for the live desk.
 * One upstream call per poll window regardless of how many viewers are polling.
 */
export interface LiveQuote {
  symbol: string;
  name: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  marketState: string | null;
  time: string | null;
}

const client = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const QUOTE_TTL_MS = 8_000;
const CHART_TTL_MS = 5 * 60_000;

const quoteCache = new Map<string, { at: number; quote: LiveQuote }>();
const chartCache = new Map<string, { at: number; points: number[] }>();

/** Index/market symbols shown in the Live Wire, with friendly labels. */
export const MARKET_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: "SPY", label: "SPY" },
  { symbol: "QQQ", label: "QQQ" },
  { symbol: "IWM", label: "IWM" },
  { symbol: "DIA", label: "DIA" },
  { symbol: "^VIX", label: "VIX" },
  { symbol: "^TNX", label: "10Y" },
];

export async function getLiveQuotes(symbols: string[]): Promise<Record<string, LiveQuote>> {
  const now = Date.now();
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const stale = unique.filter((s) => {
    const hit = quoteCache.get(s);
    return !hit || now - hit.at > QUOTE_TTL_MS;
  });

  if (stale.length > 0) {
    try {
      const results = await client.quote(stale, { return: "array" });
      for (const q of results) {
        const price = typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null;
        const time = q.regularMarketTime instanceof Date ? q.regularMarketTime.toISOString() : null;
        quoteCache.set(q.symbol.toUpperCase(), {
          at: now,
          quote: {
            symbol: q.symbol,
            name: q.shortName ?? q.longName ?? null,
            price,
            change: typeof q.regularMarketChange === "number" ? q.regularMarketChange : null,
            changePct: typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null,
            previousClose: typeof q.regularMarketPreviousClose === "number" ? q.regularMarketPreviousClose : null,
            marketState: typeof q.marketState === "string" ? q.marketState : null,
            time,
          },
        });
      }
    } catch (err) {
      // Keep serving the last cached values if Yahoo hiccups.
      console.warn("[liveQuotes] quote fetch failed:", err instanceof Error ? err.message : err);
    }
  }

  const out: Record<string, LiveQuote> = {};
  for (const s of unique) {
    const hit = quoteCache.get(s);
    if (hit) out[s] = hit.quote;
  }
  return out;
}

/** Today's intraday closes (5-minute bars), used to seed sparklines. */
export async function getIntradaySeries(symbols: string[]): Promise<Record<string, number[]>> {
  const now = Date.now();
  const out: Record<string, number[]> = {};
  await Promise.all(
    symbols.map(async (raw) => {
      const symbol = raw.toUpperCase();
      const hit = chartCache.get(symbol);
      if (hit && now - hit.at < CHART_TTL_MS) {
        out[symbol] = hit.points;
        return;
      }
      try {
        const chart = await client.chart(symbol, {
          period1: new Date(now - 4 * 24 * 3600_000),
          interval: "15m",
        });
        const quotes = chart.quotes ?? [];
        // Keep the most recent session only.
        const lastDay = quotes.length ? new Date(quotes[quotes.length - 1].date).toDateString() : null;
        const points = quotes
          .filter((q) => lastDay && new Date(q.date).toDateString() === lastDay)
          .map((q) => q.close)
          .filter((c): c is number => typeof c === "number");
        chartCache.set(symbol, { at: now, points });
        out[symbol] = points;
      } catch {
        if (hit) out[symbol] = hit.points;
      }
    })
  );
  return out;
}
