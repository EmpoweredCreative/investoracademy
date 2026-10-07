import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { getMarketStatus } from "@/lib/marketClock";
import { getIntradaySeries, getLiveQuotes, MARKET_SYMBOLS } from "@/lib/marketdata/liveQuotes";
import { syncSchwabAccount } from "@/lib/schwab/sync";
import { WIRE_GROUPS, type WireGroup } from "@/lib/marketRoutineSymbols";
import { ACCOUNT_SNAPSHOT_INCLUDE, buildAccountSnapshot, holdingSymbols } from "@/lib/services/accountSnapshot";

/** Linked accounts re-sync in the background when their data is older than this. */
const SYNC_STALE_OPEN_MS = 5 * 60_000;
const SYNC_STALE_CLOSED_MS = 60 * 60_000;

export const dynamic = "force-dynamic";

/** Throttle writing live prices back to Underlying.currentPrice. */
const lastPriceWrite = new Map<string, number>();
const PRICE_WRITE_INTERVAL_MS = 60_000;

const ACTIVITY_KIND: Record<string, string> = {
  PREMIUM_CREDIT: "CREDIT",
  PREMIUM_DEBIT: "DEBIT",
  STOCK_BUY: "BUY",
  STOCK_SELL: "SELL",
  FEE: "FEE",
  ADJUSTMENT: "ADJUST",
  CASH_DEPOSIT: "CASH",
  DIVIDEND: "DIVIDEND",
  INTEREST: "INTEREST",
};

/**
 * GET /api/live?accountId=…&series=1
 * One poll for everything that ticks: market clock, quotes, account net liq, buckets, activity.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const accountId = req.nextUrl.searchParams.get("accountId");
    const wantSeries = req.nextUrl.searchParams.get("series") === "1";
    const started = Date.now();

    const account = accountId
      ? await prisma.account.findFirst({
          where: { id: accountId, userId },
          include: ACCOUNT_SNAPSHOT_INCLUDE,
        })
      : null;

    const symbols = account ? holdingSymbols(account) : [];

    // Live Wire: the routine watchlist, then every position held across the person's accounts.
    const held = await prisma.underlying.findMany({
      where: {
        account: { userId, archivedAt: null },
        OR: [{ stockLots: { some: { remaining: { gt: 0 } } } }, { strategyInstances: { some: { status: "OPEN" } } }],
      },
      select: { symbol: true },
      distinct: ["symbol"],
      orderBy: { symbol: "asc" },
    });
    const watched = new Set(WIRE_GROUPS.flatMap((g) => g.items.map((i) => i.symbol)));
    const wire: WireGroup[] = [
      ...WIRE_GROUPS,
      {
        key: "positions",
        label: "Your positions",
        items: held.map((h) => h.symbol.toUpperCase()).filter((s) => !watched.has(s)).map((s) => ({ symbol: s, label: s })),
      },
    ].filter((g) => g.items.length > 0);

    const marketSymbols = MARKET_SYMBOLS.map((m) => m.symbol);
    const quotes = await getLiveQuotes([...marketSymbols, ...symbols, ...wire.flatMap((g) => g.items.map((i) => i.symbol))]);
    const latencyMs = Date.now() - started;
    const series = wantSeries ? await getIntradaySeries([...marketSymbols.slice(0, 4), ...symbols.slice(0, 12)]) : undefined;

    // ── Account snapshot ──
    const accountPayload = account ? buildAccountSnapshot(account, quotes) : null;
    if (account) {
      // Keep stored prices fresh so the portfolio, statement and wheel use live marks.
      const now = Date.now();
      const writes = account.underlyings.filter((u) => {
        const q = quotes[u.symbol.toUpperCase()];
        if (q?.price == null) return false;
        if (now - (lastPriceWrite.get(u.id) ?? 0) < PRICE_WRITE_INTERVAL_MS) return false;
        return !u.currentPrice || Math.abs(u.currentPrice.toNumber() - q.price) > 0.0001;
      });
      if (writes.length > 0) {
        await prisma.$transaction(
          writes.map((u) => {
            lastPriceWrite.set(u.id, now);
            return prisma.underlying.update({
              where: { id: u.id },
              data: { currentPrice: new Prisma.Decimal(quotes[u.symbol.toUpperCase()].price!) },
            });
          })
        );
      }
    }

    // ── Broker freshness ──
    const market = getMarketStatus();
    let sync = null;
    if (account?.brokerAccountHash) {
      const staleAfter = market.phase === "OPEN" ? SYNC_STALE_OPEN_MS : SYNC_STALE_CLOSED_MS;
      const age = account.lastSyncedAt ? Date.now() - account.lastSyncedAt.getTime() : Infinity;
      const syncing = age > staleAfter;
      if (syncing) {
        const id = account.id;
        after(() => syncSchwabAccount(id).catch((err) => console.warn("[live] background sync failed:", err?.message ?? err)));
      }
      sync = {
        broker: "Schwab",
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        error: account.lastSyncError,
        syncing,
        netLiq: account.syncedNetLiq?.toNumber() ?? null,
        buyingPower: account.syncedBuyingPower?.toNumber() ?? null,
        dayPnl: account.syncedDayPnl?.toNumber() ?? null,
      };
    }

    // ── Activity ──
    const ledger = await prisma.ledgerEntry.findMany({
      where: account ? { accountId: account.id } : { account: { userId } },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: { id: true, type: true, amount: true, description: true, occurredAt: true, account: { select: { name: true } } },
    });
    const notifications = await prisma.notification.findMany({
      where: { userId, ...(account ? { accountId: account.id } : {}) },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, body: true, createdAt: true },
    });
    const activity = [
      ...ledger.map((e) => ({
        id: e.id,
        kind: ACTIVITY_KIND[e.type] ?? e.type,
        title: e.description ?? e.type.replace(/_/g, " ").toLowerCase(),
        account: account ? null : e.account.name,
        amount: ["PREMIUM_DEBIT", "STOCK_BUY", "FEE"].includes(e.type) ? -e.amount.toNumber() : e.amount.toNumber(),
        at: e.occurredAt.toISOString(),
      })),
      ...notifications.map((n) => ({
        id: n.id,
        kind: "ALERT",
        title: n.title,
        account: null,
        amount: null,
        at: n.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20);

    return NextResponse.json({
      serverTime: new Date().toISOString(),
      market,
      sync,
      feed: { source: "Yahoo Finance", latencyMs, delayed: true },
      marketSymbols: MARKET_SYMBOLS,
      wire,
      quotes,
      series,
      account: accountPayload,
      activity,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
