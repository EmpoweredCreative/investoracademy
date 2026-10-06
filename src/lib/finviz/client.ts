import { parseFinvizCsv } from "@/lib/fundamentals/finvizCsvParser";
import { normalizeFilters } from "./filters";

/**
 * Finviz Elite screener export, called with each user's own Elite token (see
 * credentials.ts). Results are parsed by column header, so a changed column id
 * only drops that column rather than breaking the screen.
 */
export class FinvizError extends Error {}

/**
 * Custom-view column ids (v=152): ticker, company, sector, industry, country, market cap,
 * P/E, forward P/E, PEG, P/S, P/B, P/FCF, dividend yield, EPS growth 5y, sales growth 5y,
 * EPS growth qoq, sales growth qoq, insider transactions, institutional ownership, ROE, ROI,
 * debt/equity, gross margin, operating margin, profit margin, perf year, 200-day SMA %, price.
 */
const COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 19, 21, 22, 23, 27, 28, 33, 34, 38, 39, 40, 41, 46, 54, 65];

export const SORTS = {
  "-marketcap": "Market cap (largest)",
  pe: "P/E (lowest)",
  peg: "PEG (lowest)",
  "-roe": "ROE (highest)",
  "-epsgrowth5years": "EPS growth 5y (highest)",
  "-perf52w": "1-year performance (best)",
} as const;
export type ScreenSort = keyof typeof SORTS;

export function buildScreenUrl(filters: string[], opts: { sort?: ScreenSort; token: string }): string {
  const f = normalizeFilters(filters);
  const params = new URLSearchParams({ v: "152", c: COLUMNS.join(","), auth: opts.token });
  if (f.length) params.set("f", f.join(","));
  if (opts.sort) params.set("o", opts.sort);
  return `https://elite.finviz.com/export.ashx?${params.toString().replace(/%2C/g, ",")}`;
}

export interface ScreenRow {
  symbol: string;
  company: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  marketCap: number | null; // USD millions as Finviz reports it
  price: number | null;
  metrics: Record<string, number | null>;
}

/** Finviz CSV values: "12.34", "5.20%", "-", "1,234.5". */
export function parseNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const s = v.replace(/[,%]/g, "").trim();
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const METRIC_COLUMNS: Record<string, string> = {
  "P/E": "pe",
  "Forward P/E": "forwardPe",
  PEG: "peg",
  "P/S": "ps",
  "P/B": "pb",
  "P/Free Cash Flow": "pfcf",
  "Dividend Yield": "dividendYield",
  "Dividend": "dividendYield",
  "EPS Growth Past 5 Years": "epsGrowth5y",
  "EPS growth past 5 years": "epsGrowth5y",
  "Sales Growth Past 5 Years": "salesGrowth5y",
  "Sales growth past 5 years": "salesGrowth5y",
  "EPS Growth Quarter Over Quarter": "epsGrowthQoq",
  "EPS growth quarter over quarter": "epsGrowthQoq",
  "Sales Growth Quarter Over Quarter": "salesGrowthQoq",
  "Sales growth quarter over quarter": "salesGrowthQoq",
  "Insider Transactions": "insiderTransactions",
  "Institutional Ownership": "institutionalOwnership",
  "Return on Equity": "roe",
  "Return on Investment": "roi",
  "Return on Invested Capital": "roic",
  "Total Debt/Equity": "debtToEquity",
  "Gross Margin": "grossMargin",
  "Operating Margin": "operatingMargin",
  "Profit Margin": "profitMargin",
  "Performance (Year)": "perfYear",
  "200-Day Simple Moving Average": "vsSma200",
};

export function parseScreenCsv(csv: string): ScreenRow[] {
  return parseFinvizCsv(csv).map(({ symbol, metadata }) => {
    const metrics: Record<string, number | null> = {};
    for (const [col, key] of Object.entries(METRIC_COLUMNS)) if (col in metadata && !(key in metrics)) metrics[key] = parseNumber(metadata[col]);
    return {
      symbol,
      company: metadata.Company ?? null,
      sector: metadata.Sector ?? null,
      industry: metadata.Industry ?? null,
      country: metadata.Country ?? null,
      marketCap: parseNumber(metadata["Market Cap"]),
      price: parseNumber(metadata.Price),
      metrics,
    };
  });
}

async function fetchScreen(token: string, filters: string[], sort?: ScreenSort): Promise<ScreenRow[]> {
  const res = await fetch(buildScreenUrl(filters, { sort, token }), { headers: { "User-Agent": "WealthOS" } });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new FinvizError("Finviz didn't accept that token. Make sure it's your current Finviz Elite API token.");
  if (!res.ok) throw new FinvizError(`Finviz returned an error (${res.status}). Try again in a minute.`);
  // Finviz answers an invalid/expired token with its login page instead of CSV.
  if (/<html/i.test(text.slice(0, 500)) || !/"?Ticker"?/.test(text.split("\n")[0] ?? "")) {
    throw new FinvizError("Finviz didn't accept the token (it returned a web page, not data). Check that it's an Elite API token.");
  }
  return parseScreenCsv(text);
}

/** Throws unless the token returns screener data. */
export async function testToken(token: string) {
  const rows = await fetchScreen(token, ["cap_mega"]);
  if (!rows.length) throw new FinvizError("Finviz returned no data for that token.");
}

// Results don't depend on whose token ran the screen, so the cache is shared.
const cache = new Map<string, { at: number; rows: ScreenRow[] }>();
const TTL_MS = 15 * 60_000;

/** Run a screen on Finviz Elite with the user's token. Cached for 15 minutes per filter set. */
export async function runScreen(
  token: string | null,
  filters: string[],
  sort: ScreenSort = "-marketcap"
): Promise<{ rows: ScreenRow[]; cached: boolean }> {
  if (!token) throw new FinvizError("Connect your Finviz Elite account to run screens (Research → Screener, or Settings).");
  const key = `${normalizeFilters(filters).sort().join(",")}|${sort}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { rows: hit.rows, cached: true };
  const rows = await fetchScreen(token, filters, sort);
  cache.set(key, { at: Date.now(), rows });
  return { rows, cached: false };
}
