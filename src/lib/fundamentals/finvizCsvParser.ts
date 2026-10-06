import { parse } from "csv-parse/sync";

export interface FinvizCsvRow {
  symbol: string;
  metadata: Record<string, string>;
}

function findTickerColumn(headers: string[]): string | null {
  for (const h of headers) {
    const lower = h.trim().toLowerCase();
    if (lower === "ticker" || lower === "symbol") return h;
  }
  return null;
}

function cleanSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s || s === "-" || s === "N/A") return null;
  // Finviz tickers are usually 1-5 letters, may include .
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(s)) return null;
  return s;
}

export function parseFinvizCsv(content: string): FinvizCsvRow[] {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  if (records.length === 0) return [];

  const headers = Object.keys(records[0] ?? {});
  let tickerCol = findTickerColumn(headers);

  // Finviz export: first column sometimes "No." and second is "Ticker"
  if (!tickerCol && headers.length >= 2) {
    const second = headers[1];
    if (second) tickerCol = second;
  }

  if (!tickerCol) {
    throw new Error(
      "Could not find Ticker column in CSV. Export from Finviz screener with standard columns."
    );
  }

  const seen = new Set<string>();
  const rows: FinvizCsvRow[] = [];

  for (const record of records) {
    const rawTicker = record[tickerCol];
    if (!rawTicker) continue;
    const symbol = cleanSymbol(rawTicker);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);

    const metadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) {
      if (k !== tickerCol && v) metadata[k] = v;
    }

    rows.push({ symbol, metadata });
  }

  return rows;
}
