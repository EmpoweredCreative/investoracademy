import YahooFinance from "yahoo-finance2";

/** Forward annual dividend per share (Yahoo), cached for a day. Null when the stock doesn't pay one. */
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const TTL_MS = 24 * 3600_000;
const cache = new Map<string, { at: number; rate: number | null }>();

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

export async function getForwardDividends(symbols: string[]): Promise<Record<string, number | null>> {
  const now = Date.now();
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const stale = unique.filter((s) => {
    const hit = cache.get(s);
    return !hit || now - hit.at > TTL_MS;
  });
  if (stale.length) {
    try {
      const quotes = (await yf.quote(stale, { return: "array" }, { validateResult: false })) as Record<string, unknown>[];
      for (const q of quotes) {
        const symbol = String(q.symbol ?? "").toUpperCase();
        if (symbol) cache.set(symbol, { at: now, rate: num(q.dividendRate) ?? num(q.trailingAnnualDividendRate) });
      }
    } catch (err) {
      console.warn("[dividends] quote failed:", err instanceof Error ? err.message : err);
    }
  }
  return Object.fromEntries(unique.map((s) => [s, cache.get(s)?.rate ?? null]));
}
