import YahooFinance from "yahoo-finance2";

const client = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const TTL_MS = 60 * 60_000;
const cache = new Map<string, { at: number; rate: number }>();

/** Spot FX rate to convert an amount in `from` into `to` (e.g. CNY→USD ≈ 0.14). Cached hourly. */
export async function getFxRate(from: string, to = "USD"): Promise<number | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;
  const key = `${f}${t}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rate;
  try {
    const q = await client.quote(`${key}=X`);
    const rate = typeof q.regularMarketPrice === "number" && q.regularMarketPrice > 0 ? q.regularMarketPrice : null;
    if (rate) cache.set(key, { at: Date.now(), rate });
    return rate ?? hit?.rate ?? null;
  } catch {
    return hit?.rate ?? null;
  }
}

/** Currencies on a Yahoo quoteSummary payload: statements vs. trading price. */
export function snapshotCurrencies(raw: unknown): { financial: string | null; quote: string | null } {
  const r = (raw ?? {}) as { financialData?: { financialCurrency?: string }; summaryDetail?: { currency?: string }; price?: { currency?: string } };
  return {
    financial: r.financialData?.financialCurrency?.toUpperCase() ?? null,
    quote: (r.summaryDetail?.currency ?? r.price?.currency)?.toUpperCase() ?? null,
  };
}

/**
 * Multiplier converting statement-currency amounts into the trading currency.
 * 1 when they match; null if a conversion is needed but no rate is available.
 */
export async function statementFx(raw: unknown): Promise<number | null> {
  const { financial, quote } = snapshotCurrencies(raw);
  if (!financial || !quote || financial === quote) return 1;
  return getFxRate(financial, quote);
}
