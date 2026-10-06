/**
 * SEC EDGAR access. EDGAR is free but requires a descriptive User-Agent with a
 * contact email and allows at most 10 requests/second.
 */
const MIN_GAP_MS = 120;
let lastRequest = 0;
let queue: Promise<void> = Promise.resolve();

export class SecError extends Error {}

function userAgent() {
  const ua = process.env.SEC_USER_AGENT?.trim();
  if (!ua) throw new SecError("SEC filings aren't configured. Set SEC_USER_AGENT (e.g. \"WealthOS you@example.com\").");
  return ua;
}

/** Space requests out so we never exceed SEC's rate limit, even with parallel callers. */
function throttle(): Promise<void> {
  const turn = queue.then(async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
  });
  queue = turn.catch(() => {});
  return turn;
}

async function secFetch(url: string): Promise<Response> {
  await throttle();
  const res = await fetch(url, { headers: { "User-Agent": userAgent(), "Accept-Encoding": "gzip, deflate" } });
  if (!res.ok) throw new SecError(`SEC request failed (${res.status}) for ${url}`);
  return res;
}

export const secJson = async <T>(url: string): Promise<T> => (await secFetch(url)).json() as Promise<T>;
export const secText = async (url: string): Promise<string> => (await secFetch(url)).text();

// ── Ticker → CIK ────────────────────────────────────────────────────────────

const TICKER_TTL_MS = 24 * 3600_000;
let tickerCache: { at: number; map: Map<string, { cik: string; name: string }> } | null = null;

export const padCik = (cik: string | number) => String(cik).padStart(10, "0");

export async function lookupCik(symbol: string): Promise<{ cik: string; name: string } | null> {
  if (!tickerCache || Date.now() - tickerCache.at > TICKER_TTL_MS) {
    const data = await secJson<Record<string, { cik_str: number; ticker: string; title: string }>>(
      "https://www.sec.gov/files/company_tickers.json"
    );
    const map = new Map<string, { cik: string; name: string }>();
    for (const row of Object.values(data)) map.set(row.ticker.toUpperCase(), { cik: padCik(row.cik_str), name: row.title });
    tickerCache = { at: Date.now(), map };
  }
  const sym = symbol.toUpperCase();
  // SEC writes class shares with a dash (BRK-B); Yahoo-style tickers may use a dot.
  return tickerCache.map.get(sym) ?? tickerCache.map.get(sym.replace(".", "-")) ?? null;
}

// ── Filing index ────────────────────────────────────────────────────────────

export interface AnnualFilingRef {
  accession: string;
  form: "10-K" | "20-F";
  amended: boolean;
  periodEnd: string;
  filedAt: string;
  url: string;
}

interface Submissions {
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[];
      reportDate: string[];
      primaryDocument: string[];
    };
  };
}

/**
 * Most recent annual reports, newest first: one per fiscal period, preferring the
 * original over an amendment (10-K/A is often just a Part III add-on).
 */
export async function listAnnualFilings(cik: string, limit = 5): Promise<AnnualFilingRef[]> {
  const sub = await secJson<Submissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`);
  const r = sub.filings.recent;
  const byPeriod = new Map<string, AnnualFilingRef>();
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i];
    const base = form.replace("/A", "");
    if (base !== "10-K" && base !== "20-F") continue;
    const ref: AnnualFilingRef = {
      accession: r.accessionNumber[i],
      form: base,
      amended: form.endsWith("/A"),
      periodEnd: r.reportDate[i] || r.filingDate[i],
      filedAt: r.filingDate[i],
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${r.accessionNumber[i].replace(/-/g, "")}/${r.primaryDocument[i]}`,
    };
    const existing = byPeriod.get(ref.periodEnd);
    if (!existing || (existing.amended && !ref.amended)) byPeriod.set(ref.periodEnd, ref);
  }
  return [...byPeriod.values()].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)).slice(0, limit);
}
