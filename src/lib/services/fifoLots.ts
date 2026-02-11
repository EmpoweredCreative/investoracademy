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

  if (remainingToSell.greaterThan(0)) {
    throw new Error(
      `Insufficient shares: tried to sell ${input.quantity}, only ${new Prisma.Decimal(input.quantity).minus(remainingToSell)} available`
    );
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
