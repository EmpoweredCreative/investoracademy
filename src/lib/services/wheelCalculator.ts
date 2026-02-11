import { WheelCategory, LedgerType, CallPut, LongShort, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Resolve the WheelCategory for a StrategyInstance.
 * Resolution order:
 *   1. Instance override
 *   2. Underlying classification
 *   3. Default = MAD_MONEY
 */
export async function resolveWheelCategory(instanceId: string): Promise<WheelCategory> {
  const instance = await prisma.strategyInstance.findUniqueOrThrow({
    where: { id: instanceId },
    include: {
      underlying: {
        include: {
          wheelClassification: true,
        },
      },
    },
  });

  if (instance.wheelCategoryOverride) {
    return instance.wheelCategoryOverride;
  }

  if (instance.underlying.wheelClassification) {
    return instance.underlying.wheelClassification.category;
  }

  return "MAD_MONEY";
}

/**
 * Strategy-aware suggestion for wheel category.
 */
export function suggestWheelCategory(
  underlyingCategory: WheelCategory | null,
  callPut: CallPut | null,
  longShort: LongShort | null
): WheelCategory {
  if (underlyingCategory === "CORE") {
    if (longShort === "SHORT") return "CORE";
    if (longShort === "LONG") return "MAD_MONEY";
  }

  if (underlyingCategory === "MAD_MONEY") return "MAD_MONEY";

  return "MAD_MONEY";
}

interface WheelSlice {
  category: WheelCategory;
  currentValue: Prisma.Decimal;
  targetPct: Prisma.Decimal;
  actualPct: Prisma.Decimal;
  delta: Prisma.Decimal;
}

/**
 * Calculate the Wealth Wheel allocation for an account.
 * MVP uses COST BASIS only (no live pricing).
 */
export async function calculateWheel(accountId: string): Promise<{
  slices: WheelSlice[];
  totalValue: Prisma.Decimal;
  cashBalance: Prisma.Decimal;
}> {
  // Get wheel targets
  const targets = await prisma.wealthWheelTarget.findMany({
    where: { accountId },
  });

  const targetMap = new Map(targets.map((t) => [t.category, t.targetPct]));

  // Calculate cash balance from ledger
  const cashBalance = await calculateCashBalance(accountId);

  // Calculate stock holdings by category
  const classifications = await prisma.wealthWheelClassification.findMany({
    where: { accountId },
    include: { underlying: true },
  });

  const classMap = new Map(
    classifications.map((c) => [c.underlyingId, c.category])
  );

  // Get all open stock lots
  const lots = await prisma.stockLot.findMany({
    where: { accountId, remaining: { gt: 0 } },
  });

  // Aggregate cost basis by wheel category
  const categoryTotals = new Map<WheelCategory, Prisma.Decimal>();
  const categories: WheelCategory[] = ["CORE", "MAD_MONEY", "FREE_CAPITAL", "RISK_MGMT"];
  categories.forEach((c) => categoryTotals.set(c, new Prisma.Decimal(0)));

  for (const lot of lots) {
    const category = classMap.get(lot.underlyingId) ?? "MAD_MONEY";
    const costPerShare = lot.costBasis.div(lot.quantity);
    const lotValue = costPerShare.mul(lot.remaining);
    categoryTotals.set(category, (categoryTotals.get(category) ?? new Prisma.Decimal(0)).plus(lotValue));
  }

  // FREE_CAPITAL uses cash balance
  categoryTotals.set(
    "FREE_CAPITAL",
    (categoryTotals.get("FREE_CAPITAL") ?? new Prisma.Decimal(0)).plus(cashBalance.gt(0) ? cashBalance : new Prisma.Decimal(0))
  );

  // Compute totals
  let totalValue = new Prisma.Decimal(0);
  categoryTotals.forEach((v) => (totalValue = totalValue.plus(v)));

  const slices: WheelSlice[] = categories.map((category) => {
    const currentValue = categoryTotals.get(category) ?? new Prisma.Decimal(0);
    const targetPct = targetMap.get(category) ?? new Prisma.Decimal(0);
    const actualPct = totalValue.gt(0) ? currentValue.div(totalValue).mul(100) : new Prisma.Decimal(0);
    const delta = actualPct.minus(targetPct);

    return { category, currentValue, targetPct, actualPct, delta };
  });

  return { slices, totalValue, cashBalance };
}

/**
 * Derive cash balance from ledger entries.
 */
export async function calculateCashBalance(accountId: string): Promise<Prisma.Decimal> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId },
    select: { type: true, amount: true },
  });

  let balance = new Prisma.Decimal(0);
  for (const entry of entries) {
    switch (entry.type) {
      case LedgerType.PREMIUM_CREDIT:
      case LedgerType.STOCK_SELL:
        balance = balance.plus(entry.amount);
        break;
      case LedgerType.PREMIUM_DEBIT:
      case LedgerType.STOCK_BUY:
      case LedgerType.FEE:
        balance = balance.minus(entry.amount);
        break;
      case LedgerType.ADJUSTMENT:
        balance = balance.plus(entry.amount); // Can be positive or negative
        break;
    }
  }

  return balance;
}
