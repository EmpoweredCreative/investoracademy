import { CorePlanMode, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getBucketBalance, getHeldShares, POLICY_TO_MODE } from "./premiumSettlement";

type TxClient = Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

/**
 * Draw a just-created BUY lot from the holding's premium bucket.
 * Called from processStockEntry when the purchase is a premium reinvest.
 */
export async function recordPremiumFundedPurchase(
  tx: TxClient,
  input: {
    accountId: string;
    underlyingId: string;
    lotId: string;
    quantity: number;
    price: number;
    totalCost: Prisma.Decimal;
    occurredAt: Date;
    reinvestSignalId?: string;
  }
) {
  const balance = await getBucketBalance(tx, input.accountId, input.underlyingId);
  const drawn = Prisma.Decimal.min(balance.gt(0) ? balance : ZERO, input.totalCost);

  if (drawn.gt(0)) {
    const fundedQty = Prisma.Decimal.min(
      new Prisma.Decimal(input.quantity),
      drawn.div(input.price).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
    );
    await tx.stockLot.update({
      where: { id: input.lotId },
      data: {
        fundedBy: drawn.gte(input.totalCost) ? "PREMIUM" : "MIXED",
        premiumFundedQty: fundedQty,
      },
    });
    await tx.premiumBucketEntry.create({
      data: {
        accountId: input.accountId,
        underlyingId: input.underlyingId,
        stockLotId: input.lotId,
        kind: "REINVEST_OUT",
        amount: drawn.neg(),
        shares: new Prisma.Decimal(input.quantity),
        price: new Prisma.Decimal(input.price),
        occurredAt: input.occurredAt,
      },
    });
  }

  // Close out any live reinvest suggestion for this holding. It is complete once the
  // leftover bucket can't buy another share.
  const leftover = balance.minus(drawn);
  const pending = await tx.reinvestSignal.findMany({
    where: {
      accountId: input.accountId,
      underlyingId: input.underlyingId,
      status: { in: ["CREATED", "NOTIFIED", "SNOOZED"] },
    },
  });
  for (const signal of pending) {
    await tx.reinvestSignal.update({
      where: { id: signal.id },
      data: {
        status: leftover.lt(input.price) ? "COMPLETED" : "PARTIAL_COMPLETED",
        completedAmount: drawn,
        completedAt: new Date(),
        acknowledgedAt: signal.acknowledgedAt ?? new Date(),
        notes:
          input.reinvestSignalId && signal.id !== input.reinvestSignalId
            ? "Completed by a premium reinvest purchase"
            : signal.notes,
      },
    });
  }

  // Reaching the share goal flips the plan.
  const plan = await tx.corePlan.findUnique({ where: { underlyingId: input.underlyingId } });
  if (plan?.shareGoal != null && plan.mode !== plan.modeAfterGoal) {
    const shares = await getHeldShares(tx, input.accountId, input.underlyingId);
    if (shares.gte(plan.shareGoal)) {
      await tx.corePlan.update({ where: { id: plan.id }, data: { mode: plan.modeAfterGoal } });
    }
  }

  return { drawn };
}

export interface CoreHoldingSummary {
  underlyingId: string;
  symbol: string;
  currentPrice: number | null;
  shares: number;
  premiumFundedShares: number;
  plan: {
    mode: CorePlanMode;
    shareGoal: number | null;
    modeAfterGoal: CorePlanMode;
    reinvestThresholdShares: number;
    isDefault: boolean;
  };
  bucketBalance: number;
  premiumEarned: number;
  reinvested: number;
  basisApplied: number;
  cashedOut: number;
  canBuyShares: number | null;
  pendingSignal: { id: string; amount: number; notes: string | null } | null;
  /** Cumulative share count over time, split by funding source. */
  growth: { date: string; cashShares: number; premiumShares: number }[];
}

/**
 * Everything the Core page needs: one entry per CORE holding.
 */
export async function getCoreSummary(accountId: string): Promise<CoreHoldingSummary[]> {
  const underlyings = await prisma.underlying.findMany({
    where: { accountId, wheelClassification: { category: "CORE" } },
    include: {
      corePlan: true,
      stockLots: { orderBy: { acquiredAt: "asc" } },
      premiumBucketEntries: true,
      reinvestSignals: {
        where: { status: { in: ["CREATED", "NOTIFIED", "SNOOZED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { symbol: "asc" },
  });

  return underlyings.map((u) => {
    const sumKind = (kind: string) =>
      u.premiumBucketEntries
        .filter((e) => e.kind === kind)
        .reduce((sum, e) => sum.plus(e.amount), ZERO)
        .toNumber();

    const openLots = u.stockLots.filter((l) => l.remaining.gt(0));
    const shares = openLots.reduce((sum, l) => sum + l.remaining.toNumber(), 0);
    const premiumFundedShares = openLots.reduce(
      (sum, l) => sum + Math.min(l.premiumFundedQty.toNumber(), l.remaining.toNumber()),
      0
    );
    const bucketBalance = u.premiumBucketEntries.reduce((sum, e) => sum.plus(e.amount), ZERO).toNumber();
    const price = u.currentPrice?.toNumber() ?? null;

    // Share growth timeline from lot acquisitions (by original quantity).
    let cashShares = 0;
    let premiumShares = 0;
    const growth = u.stockLots.map((lot) => {
      const premiumQty = lot.premiumFundedQty.toNumber();
      premiumShares += premiumQty;
      cashShares += lot.quantity.toNumber() - premiumQty;
      return { date: lot.acquiredAt.toISOString(), cashShares, premiumShares };
    });

    const signal = u.reinvestSignals[0];
    return {
      underlyingId: u.id,
      symbol: u.symbol,
      currentPrice: price,
      shares,
      premiumFundedShares,
      plan: {
        mode: u.corePlan?.mode ?? (u.premiumPolicy ? POLICY_TO_MODE[u.premiumPolicy] : "ACCUMULATE"),
        shareGoal: u.corePlan?.shareGoal ?? null,
        modeAfterGoal: u.corePlan?.modeAfterGoal ?? "INCOME",
        reinvestThresholdShares: u.corePlan?.reinvestThresholdShares ?? 1,
        isDefault: !u.corePlan,
      },
      bucketBalance,
      premiumEarned: sumKind("PREMIUM_IN"),
      reinvested: -sumKind("REINVEST_OUT"),
      basisApplied: -sumKind("BASIS_APPLIED"),
      cashedOut: -sumKind("CASH_OUT"),
      canBuyShares: price && price > 0 && bucketBalance > 0 ? Math.floor(bucketBalance / price) : null,
      pendingSignal: signal
        ? { id: signal.id, amount: signal.amount.toNumber(), notes: signal.notes }
        : null,
      growth,
    };
  });
}
