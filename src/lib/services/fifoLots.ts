import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type TxClient = Prisma.TransactionClient;

/**
 * Create a new StockLot on BUY.
 */
export async function createStockLot(
  input: {
    accountId: string;
    underlyingId: string;
    quantity: number;
    costBasis: number;
    acquiredAt: Date;
  },
  tx?: TxClient
) {
  const db = tx ?? prisma;
  return db.stockLot.create({
    data: {
      accountId: input.accountId,
      underlyingId: input.underlyingId,
      quantity: new Prisma.Decimal(input.quantity),
      remaining: new Prisma.Decimal(input.quantity),
      costBasis: new Prisma.Decimal(input.costBasis),
      acquiredAt: input.acquiredAt,
    },
  });
}

/**
 * Consume stock lots on SELL using FIFO.
 * Returns consumed lots and realized gain info.
 */
export async function consumeStockLots(
  input: {
    accountId: string;
    underlyingId: string;
    quantity: number;
    sellPrice: number;
  },
  tx?: TxClient
): Promise<{
  consumed: Array<{ lotId: string; quantity: Prisma.Decimal; costBasisPortion: Prisma.Decimal }>;
  totalCostBasis: Prisma.Decimal;
  totalProceeds: Prisma.Decimal;
  realizedGain: Prisma.Decimal;
}> {
  const db = tx ?? prisma;

  // Get lots ordered FIFO (oldest first)
  const lots = await db.stockLot.findMany({
    where: {
      accountId: input.accountId,
      underlyingId: input.underlyingId,
      remaining: { gt: 0 },
    },
    orderBy: { acquiredAt: "asc" },
  });

  let remainingToSell = new Prisma.Decimal(input.quantity);
  const consumed: Array<{ lotId: string; quantity: Prisma.Decimal; costBasisPortion: Prisma.Decimal }> = [];
  let totalCostBasis = new Prisma.Decimal(0);

  for (const lot of lots) {
    if (remainingToSell.lte(0)) break;

    const sellFromLot = Prisma.Decimal.min(remainingToSell, lot.remaining);
    const costPerShare = lot.costBasis.div(lot.quantity);
    const costBasisPortion = costPerShare.mul(sellFromLot);

    // Update lot remaining
    await db.stockLot.update({
      where: { id: lot.id },
      data: {
        remaining: lot.remaining.minus(sellFromLot),
      },
    });

    consumed.push({
      lotId: lot.id,
      quantity: sellFromLot,
      costBasisPortion,
    });

    totalCostBasis = totalCostBasis.plus(costBasisPortion);
    remainingToSell = remainingToSell.minus(sellFromLot);
  }

  // If there are remaining shares to sell beyond what's in existing lots,
  // this is a short sale — create a negative-quantity lot to track the short position.
  if (remainingToSell.greaterThan(0)) {
    const shortCostBasis = new Prisma.Decimal(input.sellPrice).mul(remainingToSell);
    await db.stockLot.create({
      data: {
        accountId: input.accountId,
        underlyingId: input.underlyingId,
        quantity: remainingToSell.neg(),
        remaining: remainingToSell.neg(),
        costBasis: shortCostBasis.neg(),
        acquiredAt: new Date(),
      },
    });
  }

  const totalProceeds = new Prisma.Decimal(input.sellPrice).mul(input.quantity);
  const realizedGain = totalProceeds.minus(totalCostBasis);

  return { consumed, totalCostBasis, totalProceeds, realizedGain };
}

/**
 * Get current stock lots for an underlying in an account.
 */
export async function getStockLots(accountId: string, underlyingId: string) {
  return prisma.stockLot.findMany({
    where: {
      accountId,
      underlyingId,
      remaining: { gt: 0 },
    },
    orderBy: { acquiredAt: "asc" },
  });
}

/**
 * Get total cost basis for all open lots in an account.
 */
export async function getTotalCostBasis(accountId: string): Promise<Prisma.Decimal> {
  const lots = await prisma.stockLot.findMany({
    where: {
      accountId,
      remaining: { gt: 0 },
    },
  });

  return lots.reduce((sum, lot) => {
    const costPerShare = lot.costBasis.div(lot.quantity);
    return sum.plus(costPerShare.mul(lot.remaining));
  }, new Prisma.Decimal(0));
}

/**
 * Apply premium-based cost basis reduction to open stock lots for an underlying.
 *
 * Mirrors the Excel formula: Adjusted Cost Basis = Purchase Price - (Total Premium / shares)
 *
 * The premiumAmount is distributed proportionally across all open lots
 * based on each lot's remaining shares relative to total remaining shares.
 * The reduction is tracked in the `premiumReduction` field so the original
 * cost basis is preserved.
 */
export async function applyBasisReduction(
  input: {
    accountId: string;
    underlyingId: string;
    premiumAmount: Prisma.Decimal;
  },
  tx?: TxClient
): Promise<{ lotsUpdated: number; totalReduction: Prisma.Decimal }> {
  const db = tx ?? prisma;

  // Get all open lots for this underlying
  const lots = await db.stockLot.findMany({
    where: {
      accountId: input.accountId,
      underlyingId: input.underlyingId,
      remaining: { gt: 0 },
    },
    orderBy: { acquiredAt: "asc" },
  });

  if (lots.length === 0) {
    return { lotsUpdated: 0, totalReduction: new Prisma.Decimal(0) };
  }

  // Calculate total remaining shares across all lots
  const totalRemaining = lots.reduce(
    (sum, lot) => sum.plus(lot.remaining),
    new Prisma.Decimal(0)
  );

  if (totalRemaining.lte(0)) {
    return { lotsUpdated: 0, totalReduction: new Prisma.Decimal(0) };
  }

  // Distribute premium reduction proportionally by remaining shares
  let distributed = new Prisma.Decimal(0);

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    // Last lot gets the remainder to avoid rounding issues
    const lotShare =
      i === lots.length - 1
        ? input.premiumAmount.minus(distributed)
        : input.premiumAmount.mul(lot.remaining).div(totalRemaining);

    await db.stockLot.update({
      where: { id: lot.id },
      data: {
        premiumReduction: (lot.premiumReduction ?? new Prisma.Decimal(0)).plus(lotShare),
      },
    });

    distributed = distributed.plus(lotShare);
  }

  return { lotsUpdated: lots.length, totalReduction: distributed };
}
