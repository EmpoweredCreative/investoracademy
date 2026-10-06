import {
  CorePlanMode,
  FinalizationReason,
  LedgerType,
  PremiumPolicy,
  Prisma,
  WheelCategory,
} from "@prisma/client";
import { DEFAULT_BUCKET } from "@/lib/buckets";
import { applyBasisReduction } from "./fifoLots";

type TxClient = Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

/**
 * Net Realized Option Profit = Σ PREMIUM_CREDIT − Σ PREMIUM_DEBIT − Σ FEE.
 */
export function computeNrop(entries: { type: LedgerType; amount: Prisma.Decimal }[]): Prisma.Decimal {
  let nrop = ZERO;
  for (const entry of entries) {
    if (entry.type === LedgerType.PREMIUM_CREDIT) nrop = nrop.plus(entry.amount);
    else if (entry.type === LedgerType.PREMIUM_DEBIT) nrop = nrop.minus(entry.amount);
    else if (entry.type === LedgerType.FEE) nrop = nrop.minus(entry.amount);
  }
  return nrop;
}

/** Legacy PremiumPolicy → CorePlanMode, used when a holding has no CorePlan yet. */
export const POLICY_TO_MODE: Record<PremiumPolicy, CorePlanMode> = {
  REINVEST_ON_CLOSE: "ACCUMULATE",
  BASIS_REDUCTION: "REDUCE_BASIS",
  CASHFLOW: "INCOME",
};

export async function getHeldShares(tx: TxClient, accountId: string, underlyingId: string) {
  const agg = await tx.stockLot.aggregate({
    where: { accountId, underlyingId, remaining: { gt: 0 } },
    _sum: { remaining: true },
  });
  return agg._sum.remaining ?? ZERO;
}

export async function getBucketBalance(tx: TxClient, accountId: string, underlyingId: string) {
  const agg = await tx.premiumBucketEntry.aggregate({
    where: { accountId, underlyingId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? ZERO;
}

/**
 * Resolve the effective plan mode for a core holding.
 * Order: per-trade policy override → CorePlan (with goal switch) → legacy underlying/account policy → ACCUMULATE.
 * When the share goal is reached the stored plan is switched to `modeAfterGoal`.
 */
async function resolveCoreMode(
  tx: TxClient,
  args: {
    accountId: string;
    userId: string;
    underlyingId: string;
    symbol: string;
    instancePolicy: PremiumPolicy | null;
    underlyingPolicy: PremiumPolicy | null;
    accountPolicy: PremiumPolicy | null;
  }
): Promise<CorePlanMode> {
  if (args.instancePolicy) return POLICY_TO_MODE[args.instancePolicy];

  const plan = await tx.corePlan.findUnique({ where: { underlyingId: args.underlyingId } });
  if (plan) {
    if (plan.shareGoal != null && plan.mode !== plan.modeAfterGoal) {
      const shares = await getHeldShares(tx, args.accountId, args.underlyingId);
      if (shares.gte(plan.shareGoal)) {
        await tx.corePlan.update({ where: { id: plan.id }, data: { mode: plan.modeAfterGoal } });
        await tx.notification.create({
          data: {
            userId: args.userId,
            accountId: args.accountId,
            title: `${args.symbol} share goal reached`,
            body: `You hold ${shares.toString()} of ${plan.shareGoal} target shares. ${args.symbol} premium now goes to ${plan.modeAfterGoal === "INCOME" ? "cash flow" : "cost-basis reduction"}.`,
          },
        });
        return plan.modeAfterGoal;
      }
    }
    return plan.mode;
  }

  const legacy = args.underlyingPolicy ?? args.accountPolicy;
  return legacy ? POLICY_TO_MODE[legacy] : "ACCUMULATE";
}

export interface SettlementResult {
  nrop: Prisma.Decimal;
  bucket: WheelCategory;
  coreMode: CorePlanMode | null;
  reinvestSuggestedShares: number | null;
}

/**
 * Finalize an option StrategyInstance and route its premium.
 *
 * Every close path (manual BTC/STC/expire/assign, journal close, CSV import, broker sync)
 * goes through here so bucket accounting stays consistent.
 *
 * Routing only applies to SHORT options in the CORE bucket:
 *   ACCUMULATE   → PREMIUM_IN; suggest a reinvest when the bucket can buy shares
 *   REDUCE_BASIS → PREMIUM_IN + BASIS_APPLIED (lowers lot cost basis)
 *   INCOME       → PREMIUM_IN + CASH_OUT (released to Free Money)
 * Speculation and Free Money premium stays as plain account cash.
 */
export async function settleOptionInstance(
  tx: TxClient,
  input: { instanceId: string; reason: FinalizationReason; finalizedAt: Date }
): Promise<SettlementResult> {
  const instance = await tx.strategyInstance.findUniqueOrThrow({
    where: { id: input.instanceId },
    include: {
      ledgerEntries: true,
      underlying: { include: { wheelClassification: true } },
      account: { select: { userId: true, defaultPolicy: true } },
    },
  });

  const nrop = computeNrop(instance.ledgerEntries);

  await tx.strategyInstance.update({
    where: { id: instance.id },
    data: {
      status: "FINALIZED",
      finalizationReason: input.reason,
      finalizedAt: input.finalizedAt,
      realizedOptionProfit: nrop,
    },
  });

  // Re-settling (e.g. edited exit price) must not double count.
  await reverseSettlement(tx, instance.id);

  const bucket =
    instance.wheelCategoryOverride ?? instance.underlying.wheelClassification?.category ?? DEFAULT_BUCKET;

  const result: SettlementResult = { nrop, bucket, coreMode: null, reinvestSuggestedShares: null };
  if (bucket !== "CORE" || instance.longShort !== "SHORT" || nrop.isZero()) return result;

  const { accountId, underlyingId } = instance;
  const symbol = instance.underlying.symbol;
  const mode = await resolveCoreMode(tx, {
    accountId,
    userId: instance.account.userId,
    underlyingId,
    symbol,
    instancePolicy: instance.premiumPolicyOverride,
    underlyingPolicy: instance.underlying.premiumPolicy,
    accountPolicy: instance.account.defaultPolicy,
  });
  result.coreMode = mode;

  // Losing core trades only reduce an accumulating bucket; basis and income modes ignore losses.
  if (nrop.isNegative() && mode !== "ACCUMULATE") return result;

  const base = {
    accountId,
    underlyingId,
    strategyInstanceId: instance.id,
    occurredAt: input.finalizedAt,
  };
  await tx.premiumBucketEntry.create({
    data: { ...base, kind: "PREMIUM_IN", amount: nrop, note: `${symbol} ${instance.callPut ?? ""} ${instance.strike ?? ""}`.trim() },
  });

  if (mode === "REDUCE_BASIS") {
    const { totalReduction } = await applyBasisReduction({ accountId, underlyingId, premiumAmount: nrop }, tx);
    if (totalReduction.gt(0)) {
      await tx.premiumBucketEntry.create({
        data: { ...base, kind: "BASIS_APPLIED", amount: totalReduction.neg() },
      });
    }
    // No shares to reduce → premium stays in the bucket until shares exist.
  } else if (mode === "INCOME") {
    await tx.premiumBucketEntry.create({ data: { ...base, kind: "CASH_OUT", amount: nrop.neg() } });
  } else {
    result.reinvestSuggestedShares = await suggestReinvest(tx, {
      accountId,
      underlyingId,
      instanceId: instance.id,
      currentPrice: instance.underlying.currentPrice,
      finalizedAt: input.finalizedAt,
    });
  }

  return result;
}

/**
 * Create (or refresh) a reinvest signal when the bucket can buy at least the plan's threshold of shares.
 * Older pending signals for the same holding are superseded so only one suggestion is live.
 */
async function suggestReinvest(
  tx: TxClient,
  args: {
    accountId: string;
    underlyingId: string;
    instanceId: string;
    currentPrice: Prisma.Decimal | null;
    finalizedAt: Date;
  }
): Promise<number | null> {
  const balance = await getBucketBalance(tx, args.accountId, args.underlyingId);
  if (balance.lte(0)) return null;

  const plan = await tx.corePlan.findUnique({ where: { underlyingId: args.underlyingId } });
  const threshold = plan?.reinvestThresholdShares ?? 1;

  let shares: number | null = null;
  if (args.currentPrice && args.currentPrice.gt(0)) {
    shares = balance.div(args.currentPrice).floor().toNumber();
    if (shares < threshold) return null;
  }

  await tx.reinvestSignal.updateMany({
    where: {
      accountId: args.accountId,
      underlyingId: args.underlyingId,
      status: { in: ["CREATED", "NOTIFIED", "SNOOZED"] },
      instanceId: { not: args.instanceId },
    },
    data: { status: "SKIPPED", notes: "Superseded by a newer premium credit" },
  });

  await tx.reinvestSignal.upsert({
    where: { instanceId: args.instanceId },
    create: {
      accountId: args.accountId,
      underlyingId: args.underlyingId,
      instanceId: args.instanceId,
      amount: balance,
      dueAt: args.finalizedAt,
      notes: shares != null ? `Bucket can buy ${shares} share${shares === 1 ? "" : "s"}` : null,
    },
    update: { amount: balance, status: "CREATED" },
  });

  return shares;
}

/**
 * Undo everything settleOptionInstance did for an instance (used on re-open, edit and delete).
 * Does not change the instance's status; callers decide that.
 */
export async function reverseSettlement(tx: TxClient, instanceId: string) {
  const entries = await tx.premiumBucketEntry.findMany({ where: { strategyInstanceId: instanceId } });
  for (const entry of entries) {
    if (entry.kind === "BASIS_APPLIED") {
      // BASIS_APPLIED is stored negative; re-apply the opposite to restore basis.
      await applyBasisReduction(
        { accountId: entry.accountId, underlyingId: entry.underlyingId, premiumAmount: entry.amount },
        tx
      );
    }
  }
  if (entries.length > 0) {
    await tx.premiumBucketEntry.deleteMany({ where: { strategyInstanceId: instanceId } });
  }
  await tx.reinvestSignal.deleteMany({
    where: { instanceId, status: { in: ["CREATED", "NOTIFIED", "SNOOZED"] } },
  });
}

/**
 * Re-open a finalized instance: reverse bucket routing and clear finalization fields.
 */
export async function reopenOptionInstance(tx: TxClient, instanceId: string) {
  await reverseSettlement(tx, instanceId);
  await tx.strategyInstance.update({
    where: { id: instanceId },
    data: { status: "OPEN", finalizationReason: null, finalizedAt: null, realizedOptionProfit: null },
  });
}
