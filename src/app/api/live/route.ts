import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { BUCKETS, DEFAULT_BUCKET, type Bucket } from "@/lib/buckets";
import { getMarketStatus } from "@/lib/marketClock";
import { getIntradaySeries, getLiveQuotes, MARKET_SYMBOLS } from "@/lib/marketdata/liveQuotes";
import { syncSchwabAccount } from "@/lib/schwab/sync";

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
          include: {
            wheelTargets: true,
            underlyings: {
              include: {
                wheelClassification: true,
                stockLots: { where: { remaining: { gt: 0 } } },
                strategyInstances: { where: { status: "OPEN", instrumentType: "OPTION" }, select: { id: true } },
              },
            },
          },
        })
      : null;

    const holdingSymbols = (account?.underlyings ?? [])
      .filter((u) => u.stockLots.length > 0 || u.strategyInstances.length > 0)
      .map((u) => u.symbol);

    const marketSymbols = MARKET_SYMBOLS.map((m) => m.symbol);
    const quotes = await getLiveQuotes([...marketSymbols, ...holdingSymbols]);
    const latencyMs = Date.now() - started;
    const series = wantSeries ? await getIntradaySeries([...marketSymbols.slice(0, 4), ...holdingSymbols.slice(0, 12)]) : undefined;

    // ── Account snapshot ──
    let accountPayload = null;
    if (account) {
      const cash = account.cashBalance.toNumber();
      const reserve = account.cashflowReserve.toNumber();
      const bucketValues = new Map<Bucket, number>(BUCKETS.map((b) => [b, 0]));
      let holdingsValue = 0;
      let dayChange = 0;
      let costBasis = 0;

      const holdings = account.underlyings
        .filter((u) => u.stockLots.length > 0 || u.strategyInstances.length > 0)
        .map((u) => {
          const shares = u.stockLots.reduce((s, l) => s + l.remaining.toNumber(), 0);
          const adjustedCost = u.stockLots.reduce((s, l) => {
            const perShare = l.costBasis.div(l.quantity).minus(l.premiumReduction.div(l.quantity));
            return s + perShare.mul(l.remaining).toNumber();
          }, 0);
          const q = quotes[u.symbol.toUpperCase()];
          const price = q?.price ?? u.currentPrice?.toNumber() ?? (shares > 0 ? adjustedCost / shares : null);
          const value = price != null ? price * shares : adjustedCost;
          const change = q?.change ?? 0;
          const bucket = (u.wheelClassification?.category ?? DEFAULT_BUCKET) as Bucket;

          holdingsValue += value;
          dayChange += change * shares;
          costBasis += adjustedCost;
          bucketValues.set(bucket, (bucketValues.get(bucket) ?? 0) + value);

          return {
            underlyingId: u.id,
            symbol: u.symbol,
            name: q?.name ?? null,
            bucket,
            shares,
            price,
            change: q?.change ?? null,
            changePct: q?.changePct ?? null,
            value,
            costBasis: adjustedCost,
            unrealized: shares > 0 && price != null ? value - adjustedCost : null,
            openOptions: u.strategyInstances.length,
          };
        })
        .sort((a, b) => b.value - a.value);

      // Open options (from the last broker sync) count toward Speculation.
      bucketValues.set("SPECULATION", (bucketValues.get("SPECULATION") ?? 0) + (account.syncedOptionValue?.toNumber() ?? 0));
      // Cash and reserve count toward Free Money.
      bucketValues.set("RISK_FREE_MONEY", (bucketValues.get("RISK_FREE_MONEY") ?? 0) + cash + reserve);
      // Linked accounts include option market value from the last Schwab sync; equities mark live.
      const optionValue = account.syncedOptionValue?.toNumber() ?? 0;
      const netLiq = holdingsValue + cash + reserve + optionValue;
      const targets = new Map(account.wheelTargets.map((t) => [t.category as Bucket, t.targetPct.toNumber()]));

      accountPayload = {
        id: account.id,
        name: account.name,
        mode: account.mode,
        netLiq,
        cash,
        reserve,
        holdingsValue,
        costBasis,
        unrealized: holdingsValue - costBasis,
        dayChange,
        dayChangePct: netLiq - dayChange > 0 ? (dayChange / (netLiq - dayChange)) * 100 : 0,
        buckets: BUCKETS.map((b) => {
          const value = bucketValues.get(b) ?? 0;
          return {
            bucket: b,
            value,
            actualPct: netLiq > 0 ? (value / netLiq) * 100 : 0,
            targetPct: targets.get(b) ?? 0,
          };
        }),
        holdings,
      };

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
      quotes,
      series,
      account: accountPayload,
      activity,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
