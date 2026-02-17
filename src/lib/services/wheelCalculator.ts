import { WheelCategory, LedgerType, CallPut, LongShort, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Multiplier for options (1 contract = 100 shares). */
const OPTIONS_MULTIPLIER = 100;

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
 * Compute capital-at-risk (buying power effect) for open option positions by wheel category.
 * Reserves only the cash that would actually be at risk:
 * - Spreads: reserve spread width only (e.g. bear call spread = 5 points = $500/contract).
 * - Covered calls: reserve 0 when we own enough stock to deliver if assigned.
 * - Iron condor/butterfly: put spread width + call spread width (call side 0 if covered by stock).
 */
export async function calculateOptionRiskByCategory(accountId: string): Promise<{
  byCategory: Map<WheelCategory, Prisma.Decimal>;
  total: Prisma.Decimal;
}> {
  const [openInstances, stockLots] = await Promise.all([
    prisma.strategyInstance.findMany({
      where: { accountId, instrumentType: "OPTION", status: "OPEN" },
      include: {
        underlying: { include: { wheelClassification: true } },
      },
      orderBy: [{ strategyGroupId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.stockLot.findMany({
      where: { accountId, remaining: { not: 0 } },
      select: { underlyingId: true, remaining: true },
    }),
  ]);

  // Total shares owned per underlying (for covered-call check)
  const sharesByUnderlying = new Map<string, Prisma.Decimal>();
  for (const lot of stockLots) {
    const current = sharesByUnderlying.get(lot.underlyingId) ?? new Prisma.Decimal(0);
    sharesByUnderlying.set(lot.underlyingId, current.plus(lot.remaining));
  }

  const isShortCallCovered = (underlyingId: string, contractQty: Prisma.Decimal): boolean => {
    const shares = sharesByUnderlying.get(underlyingId);
    if (!shares) return false;
    const sharesNeeded = contractQty.mul(OPTIONS_MULTIPLIER);
    return shares.gte(sharesNeeded);
  };

  const byCategory = new Map<WheelCategory, Prisma.Decimal>();
  (["CORE", "MAD_MONEY", "FREE_CAPITAL", "RISK_MGMT"] as WheelCategory[]).forEach((c) =>
    byCategory.set(c, new Prisma.Decimal(0))
  );

  const resolveCategory = (inst: (typeof openInstances)[0]): WheelCategory => {
    if (inst.wheelCategoryOverride) return inst.wheelCategoryOverride;
    if (inst.underlying.wheelClassification) return inst.underlying.wheelClassification.category;
    return "MAD_MONEY";
  };

  const addRisk = (category: WheelCategory, amount: Prisma.Decimal) => {
    byCategory.set(category, (byCategory.get(category) ?? new Prisma.Decimal(0)).plus(amount));
  };

  const processedGroupIds = new Set<string | null>();

  for (let i = 0; i < openInstances.length; i++) {
    const inst = openInstances[i];
    const gid = inst.strategyGroupId;

    if (gid && processedGroupIds.has(gid)) continue;

    let risk: Prisma.Decimal;
    const category = resolveCategory(inst);
    const qty = inst.quantity;
    const mult = new Prisma.Decimal(OPTIONS_MULTIPLIER);

    if (gid) {
      const group = openInstances.filter((x) => x.strategyGroupId === gid);
      processedGroupIds.add(gid);

      const strategyType = inst.strategyType;

      if (strategyType === "BULL_PUT_SPREAD" || strategyType === "BEAR_PUT_SPREAD") {
        const puts = group.filter((x) => x.callPut === "PUT");
        const shortPut = puts.find((x) => x.longShort === "SHORT");
        const longPut = puts.find((x) => x.longShort === "LONG");
        if (shortPut?.strike != null && longPut?.strike != null) {
          const width = shortPut.strike.gt(longPut.strike)
            ? shortPut.strike.minus(longPut.strike)
            : longPut.strike.minus(shortPut.strike);
          risk = width.mul(mult).mul(qty);
        } else {
          risk = new Prisma.Decimal(0);
        }
      } else if (strategyType === "BEAR_CALL_SPREAD" || strategyType === "BULL_CALL_SPREAD") {
        const calls = group.filter((x) => x.callPut === "CALL");
        const shortCall = calls.find((x) => x.longShort === "SHORT");
        const longCall = calls.find((x) => x.longShort === "LONG");
        if (shortCall?.strike != null && longCall?.strike != null) {
          const width = longCall.strike.gt(shortCall.strike)
            ? longCall.strike.minus(shortCall.strike)
            : shortCall.strike.minus(longCall.strike);
          risk = width.mul(mult).mul(qty);
        } else {
          risk = new Prisma.Decimal(0);
        }
      } else if (strategyType === "IRON_CONDOR" || strategyType === "IRON_BUTTERFLY" || strategyType === "SHORT_STRANGLE") {
        const puts = group.filter((x) => x.callPut === "PUT");
        const calls = group.filter((x) => x.callPut === "CALL");
        const shortPut = puts.find((x) => x.longShort === "SHORT");
        const longPut = puts.find((x) => x.longShort === "LONG");
        const shortCall = calls.find((x) => x.longShort === "SHORT");
        const longCall = calls.find((x) => x.longShort === "LONG");

        let putSide = new Prisma.Decimal(0);
        let callSide = new Prisma.Decimal(0);

        if (shortPut?.strike != null) {
          if (longPut?.strike != null) {
            const putWidth = shortPut.strike.gt(longPut.strike)
              ? shortPut.strike.minus(longPut.strike)
              : longPut.strike.minus(shortPut.strike);
            putSide = putWidth.mul(mult).mul(qty);
          } else {
            putSide = shortPut.strike.mul(mult).mul(qty);
          }
        }

        if (shortCall?.strike != null) {
          const callCovered = inst.underlyingId ? isShortCallCovered(inst.underlyingId, qty) : false;
          if (callCovered) {
            callSide = new Prisma.Decimal(0);
          } else if (longCall?.strike != null) {
            const callWidth = longCall.strike.gt(shortCall.strike)
              ? longCall.strike.minus(shortCall.strike)
              : shortCall.strike.minus(longCall.strike);
            callSide = callWidth.mul(mult).mul(qty);
          } else {
            callSide = shortCall.strike.mul(mult).mul(qty);
          }
        }

        risk = putSide.plus(callSide);
      } else {
        risk = new Prisma.Decimal(0);
      }

      addRisk(category, risk);
    } else {
      // Standalone option
      if (inst.strategyType === "COVERED_CALL") {
        risk = new Prisma.Decimal(0);
      } else if (inst.callPut === "CALL" && inst.longShort === "SHORT" && inst.underlyingId && isShortCallCovered(inst.underlyingId, qty)) {
        risk = new Prisma.Decimal(0);
      } else if (inst.longShort === "SHORT" && (inst.callPut === "PUT" || inst.callPut === "CALL")) {
        risk = (inst.strike ?? new Prisma.Decimal(0)).mul(mult).mul(qty);
      } else {
        risk = new Prisma.Decimal(0);
      }
      addRisk(category, risk);
    }
  }

  let total = new Prisma.Decimal(0);
  byCategory.forEach((v) => (total = total.plus(v)));
  return { byCategory, total };
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

  // Calculate stock holdings and open-option risk by category
  const [classifications, journalTrades, lots, optionRisk] = await Promise.all([
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
    calculateOptionRiskByCategory(accountId),
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

  // Add open-option risk to each category (Mad Money, etc.) so risk shows in the wheel
  optionRisk.byCategory.forEach((riskAmount, category) => {
    if (riskAmount.gt(0)) {
      categoryTotals.set(category, (categoryTotals.get(category) ?? new Prisma.Decimal(0)).plus(riskAmount));
    }
  });

  // FREE_CAPITAL = cash minus total option risk (cash "reserved" against open options)
  const freeCapitalCash = cashBalance.minus(optionRisk.total);
  categoryTotals.set(
    "FREE_CAPITAL",
    (categoryTotals.get("FREE_CAPITAL") ?? new Prisma.Decimal(0)).plus(freeCapitalCash.gt(0) ? freeCapitalCash : new Prisma.Decimal(0))
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
