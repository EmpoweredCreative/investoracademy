import { Prisma } from "@prisma/client";
import { BUCKETS, DEFAULT_BUCKET, type Bucket } from "@/lib/buckets";
import type { LiveQuote } from "@/lib/marketdata/liveQuotes";

/**
 * Live account value: holdings marked at live quotes, cash, reserve and synced
 * option value, plus buckets and per-holding detail. Shared by /api/live and the dashboard.
 */
export const ACCOUNT_SNAPSHOT_INCLUDE = {
  wheelTargets: true,
  underlyings: {
    include: {
      wheelClassification: true,
      stockLots: { where: { remaining: { gt: 0 } } },
      strategyInstances: { where: { status: "OPEN" as const, instrumentType: "OPTION" as const }, select: { id: true } },
    },
  },
} satisfies Prisma.AccountInclude;

export type SnapshotAccount = Prisma.AccountGetPayload<{ include: typeof ACCOUNT_SNAPSHOT_INCLUDE }>;

/** Symbols to quote for an account (stock held or an open option). */
export function holdingSymbols(account: SnapshotAccount): string[] {
  return account.underlyings.filter((u) => u.stockLots.length > 0 || u.strategyInstances.length > 0).map((u) => u.symbol);
}

export function buildAccountSnapshot(account: SnapshotAccount, quotes: Record<string, LiveQuote>) {
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

  return {
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
}

export type AccountSnapshot = ReturnType<typeof buildAccountSnapshot>;
