import YahooFinance from "yahoo-finance2";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const client = new YahooFinance();

const BATCH_DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return null;
}

export interface NormalizedFundamentalSnapshot {
  symbol: string;
  price: number | null;
  trailingPe: number | null;
  forwardPe: number | null;
  pegRatio: number | null;
  enterpriseToEbitda: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  profitMargins: number | null;
  nextEarningsDate: Date | null;
  raw: unknown;
}

export async function fetchYahooFundamentals(
  symbol: string
): Promise<NormalizedFundamentalSnapshot> {
  const sym = symbol.toUpperCase();
  const result = await client.quoteSummary(sym, {
    modules: [
      "financialData",
      "defaultKeyStatistics",
      "summaryDetail",
      "calendarEvents",
    ],
  });

  const financial = result.financialData;
  const stats = result.defaultKeyStatistics;
  const summary = result.summaryDetail;
  const calendar = result.calendarEvents;

  let nextEarningsDate: Date | null = null;
  const earnings = calendar?.earnings?.earningsDate;
  if (earnings && earnings.length > 0) {
    const d = earnings[0];
    nextEarningsDate = d instanceof Date ? d : new Date(d as string);
  }

  return {
    symbol: sym,
    price: toNum(summary?.regularMarketPrice ?? financial?.currentPrice),
    trailingPe: toNum(summary?.trailingPE ?? stats?.trailingPE),
    forwardPe: toNum(summary?.forwardPE ?? stats?.forwardPE),
    pegRatio: toNum(stats?.pegRatio),
    enterpriseToEbitda: toNum(stats?.enterpriseToEbitda),
    priceToBook: toNum(stats?.priceToBook),
    priceToSales: toNum(summary?.priceToSalesTrailing12Months ?? stats?.priceToSalesTrailing12Months),
    debtToEquity: toNum(stats?.debtToEquity),
    returnOnEquity: toNum(stats?.returnOnEquity ?? financial?.returnOnEquity),
    profitMargins: toNum(financial?.profitMargins),
    nextEarningsDate,
    raw: result,
  };
}

export async function upsertFundamentalSnapshot(
  accountId: string,
  data: NormalizedFundamentalSnapshot
) {
  const decimal = (n: number | null) =>
    n !== null ? n : undefined;

  return prisma.fundamentalSnapshot.upsert({
    where: {
      accountId_symbol: { accountId, symbol: data.symbol },
    },
    create: {
      accountId,
      symbol: data.symbol,
      price: decimal(data.price),
      trailingPe: decimal(data.trailingPe),
      forwardPe: decimal(data.forwardPe),
      pegRatio: decimal(data.pegRatio),
      enterpriseToEbitda: decimal(data.enterpriseToEbitda),
      priceToBook: decimal(data.priceToBook),
      priceToSales: decimal(data.priceToSales),
      debtToEquity: decimal(data.debtToEquity),
      returnOnEquity: decimal(data.returnOnEquity),
      profitMargins: decimal(data.profitMargins),
      nextEarningsDate: data.nextEarningsDate,
      raw: data.raw as Prisma.InputJsonValue,
    },
    update: {
      fetchedAt: new Date(),
      price: decimal(data.price),
      trailingPe: decimal(data.trailingPe),
      forwardPe: decimal(data.forwardPe),
      pegRatio: decimal(data.pegRatio),
      enterpriseToEbitda: decimal(data.enterpriseToEbitda),
      priceToBook: decimal(data.priceToBook),
      priceToSales: decimal(data.priceToSales),
      debtToEquity: decimal(data.debtToEquity),
      returnOnEquity: decimal(data.returnOnEquity),
      profitMargins: decimal(data.profitMargins),
      nextEarningsDate: data.nextEarningsDate,
      raw: data.raw as Prisma.InputJsonValue,
    },
  });
}

export async function refreshSymbolFundamentals(
  accountId: string,
  symbol: string
): Promise<void> {
  const sym = symbol.toUpperCase();

  await prisma.fundamentalWatchlistItem.upsert({
    where: { accountId_symbol: { accountId, symbol: sym } },
    create: {
      accountId,
      symbol: sym,
      source: "MANUAL",
      yahooFetchStatus: "FETCHING",
    },
    update: { yahooFetchStatus: "FETCHING", yahooFetchError: null },
  });

  try {
    const data = await fetchYahooFundamentals(sym);
    await upsertFundamentalSnapshot(accountId, data);
    await prisma.fundamentalWatchlistItem.update({
      where: { accountId_symbol: { accountId, symbol: sym } },
      data: {
        yahooFetchStatus: "READY",
        yahooFetchError: null,
        yahooFetchedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Yahoo fetch failed";
    await prisma.fundamentalWatchlistItem.update({
      where: { accountId_symbol: { accountId, symbol: sym } },
      data: {
        yahooFetchStatus: "ERROR",
        yahooFetchError: message,
      },
    }).catch(() => {});
    throw err;
  }
}

/** Step 2: sequential Yahoo fetch with rate limiting */
export async function refreshFundamentalsBatch(
  accountId: string,
  symbols: string[]
): Promise<{ success: string[]; failed: { symbol: string; error: string }[] }> {
  const success: string[] = [];
  const failed: { symbol: string; error: string }[] = [];

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]!.toUpperCase();
    try {
      await refreshSymbolFundamentals(accountId, sym);
      success.push(sym);
    } catch (err) {
      failed.push({
        symbol: sym,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
    if (i < symbols.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { success, failed };
}
