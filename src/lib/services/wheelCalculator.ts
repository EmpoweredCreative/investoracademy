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
 * Cash balance uses the manually-entered value on the Account,
 * falling back to ledger-derived balance if not set.
 */
export async function calculateWheel(accountId: string): Promise<{
  slices: WheelSlice[];
  totalValue: Prisma.Decimal;
  cashBalance: Prisma.Decimal;
  cashflowReserve: Prisma.Decimal;
}> {
  // Get the account for manual cash fields
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
  });

  // Get wheel targets
  const targets = await prisma.wealthWheelTarget.findMany({
    where: { accountId },
  });

  const targetMap = new Map(targets.map((t) => [t.category, t.targetPct]));

  // Use manually-entered cash balance; fall back to ledger-derived if zero
  const manualCash = account.cashBalance ?? new Prisma.Decimal(0);
  const cashBalance = manualCash.gt(0) ? manualCash : await calculateCashBalance(accountId);
  const cashflowReserve = account.cashflowReserve ?? new Prisma.Decimal(0);

  // Calculate stock holdings by category
  // Fetch explicit classifications and journal trade overrides in parallel
  const [classifications, journalTrades, lots] = await Promise.all([
    prisma.wealthWheelClassification.findMany({
      where: { accountId },
    }),
    prisma.journalTrade.findMany({
      where: { accountId, wheelCategoryOverride: { not: null } },
      select: { underlyingId: true, wheelCategoryOverride: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.stockLot.findMany({
      where: { accountId, remaining: { not: 0 } },
    }),
  ]);

  // Build category map: WealthWheelClassification is the primary source
  const classMap = new Map(
    classifications.map((c) => [c.underlyingId, c.category])
  );

  // For underlyings without a classification, fall back to the most recent
  // journal trade wheelCategoryOverride and auto-create the missing record
  const missingClassifications: { underlyingId: string; category: WheelCategory }[] = [];
  for (const trade of journalTrades) {
    if (!classMap.has(trade.underlyingId) && trade.wheelCategoryOverride) {
      classMap.set(trade.underlyingId, trade.wheelCategoryOverride);
      missingClassifications.push({
        underlyingId: trade.underlyingId,
        category: trade.wheelCategoryOverride,
      });
    }
  }

  // Auto-heal: create missing WealthWheelClassification records so future
  // calculations don't need the fallback
  if (missingClassifications.length > 0) {
    for (const missing of missingClassifications) {
      await prisma.wealthWheelClassification.upsert({
        where: { underlyingId: missing.underlyingId },
        create: {
          accountId,
          underlyingId: missing.underlyingId,
          category: missing.category,
        },
        update: {
          category: missing.category,
        },
      });
    }
  }

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

  return { slices, totalValue, cashBalance, cashflowReserve };
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
      case LedgerType.CASH_DEPOSIT:
        balance = balance.plus(entry.amount); // Can be positive or negative
        break;
    }
  }

  return balance;
}
