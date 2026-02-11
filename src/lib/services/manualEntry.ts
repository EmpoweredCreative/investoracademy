import { LedgerType, OptionAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createStockLot, consumeStockLots } from "./fifoLots";
import { finalizeInstance } from "./instanceFinalizer";

interface StockEntryInput {
  accountId: string;
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  fees: number;
  occurredAt: Date;
  notes?: string;
}

interface OptionEntryInput {
  accountId: string;
  symbol: string;
  action: OptionAction;
  callPut: "CALL" | "PUT";
  strike: number;
  expiration: Date;
  quantity: number;
  price: number;
  fees: number;
  occurredAt: Date;
  premiumPolicyOverride?: "CASHFLOW" | "BASIS_REDUCTION" | "REINVEST_ON_CLOSE";
  wheelCategoryOverride?: "CORE" | "MAD_MONEY" | "FREE_CAPITAL" | "RISK_MGMT";
  notes?: string;
}

/**
 * Process a manual stock entry (BUY or SELL).
 */
export async function processStockEntry(input: StockEntryInput) {
  return prisma.$transaction(async (tx) => {
    // Ensure underlying exists
    const underlying = await tx.underlying.upsert({
      where: {
        accountId_symbol: { accountId: input.accountId, symbol: input.symbol },
      },
      create: { accountId: input.accountId, symbol: input.symbol },
      update: {},
    });

    const totalAmount = new Prisma.Decimal(input.price).mul(input.quantity);

    // Create ledger entry
    const ledgerEntry = await tx.ledgerEntry.create({
      data: {
        accountId: input.accountId,
        type: input.action === "BUY" ? LedgerType.STOCK_BUY : LedgerType.STOCK_SELL,
        amount: totalAmount,
        occurredAt: input.occurredAt,
        description: `${input.action} ${input.quantity} ${input.symbol} @ $${input.price}`,
      },
    });

    // Fee entry if applicable
    if (input.fees > 0) {
      await tx.ledgerEntry.create({
        data: {
          accountId: input.accountId,
          type: LedgerType.FEE,
          amount: new Prisma.Decimal(input.fees),
          occurredAt: input.occurredAt,
          description: `Fee for ${input.action} ${input.symbol}`,
        },
      });
    }

    // FIFO processing
    if (input.action === "BUY") {
      await createStockLot(
        {
          accountId: input.accountId,
          underlyingId: underlying.id,
          quantity: input.quantity,
          costBasis: totalAmount.plus(input.fees).toNumber(),
          acquiredAt: input.occurredAt,
        },
        tx
      );
    } else {
      await consumeStockLots(
        {
          accountId: input.accountId,
          underlyingId: underlying.id,
          quantity: input.quantity,
          sellPrice: input.price,
        },
        tx
      );
    }

    return ledgerEntry;
  });
}

/**
 * Process a manual option entry.
 * STO/BTO = open new instance.
 * BTC/STC/EXPIRE/ASSIGN/EXERCISE = finalize existing instance.
 */
export async function processOptionEntry(input: OptionEntryInput) {
  return prisma.$transaction(async (tx) => {
    // Ensure underlying exists
    const underlying = await tx.underlying.upsert({
      where: {
        accountId_symbol: { accountId: input.accountId, symbol: input.symbol },
      },
      create: { accountId: input.accountId, symbol: input.symbol },
      update: {},
    });

    const totalAmount = new Prisma.Decimal(input.price).mul(input.quantity).mul(100); // Options are x100
    const isOpening = input.action === "STO" || input.action === "BTO";

    let instanceId: string;

    if (isOpening) {
      const instance = await tx.strategyInstance.create({
        data: {
          accountId: input.accountId,
          underlyingId: underlying.id,
          instrumentType: "OPTION",
          optionAction: input.action,
          callPut: input.callPut,
          longShort: input.action === "STO" ? "SHORT" : "LONG",
          strike: new Prisma.Decimal(input.strike),
          expiration: input.expiration,
          quantity: new Prisma.Decimal(input.quantity),
          premiumPolicyOverride: input.premiumPolicyOverride || null,
          wheelCategoryOverride: input.wheelCategoryOverride || null,
          notes: input.notes,
        },
      });
      instanceId = instance.id;
    } else {
      // Find matching open instance
      const openInstance = await tx.strategyInstance.findFirst({
        where: {
          accountId: input.accountId,
          underlyingId: underlying.id,
          instrumentType: "OPTION",
          status: "OPEN",
          strike: new Prisma.Decimal(input.strike),
          callPut: input.callPut,
        },
        orderBy: { createdAt: "asc" },
      });

      if (!openInstance) {
        throw new Error(
          `No matching open instance found for ${input.symbol} ${input.strike} ${input.callPut}`
        );
      }
      instanceId = openInstance.id;
    }

    // Determine ledger type
    let ledgerType: LedgerType;
    if (input.action === "STO" || input.action === "STC") {
      ledgerType = LedgerType.PREMIUM_CREDIT;
    } else if (input.action === "BTO" || input.action === "BTC") {
      ledgerType = LedgerType.PREMIUM_DEBIT;
    } else {
      ledgerType = LedgerType.FEE;
    }

    // Create ledger entry
    await tx.ledgerEntry.create({
      data: {
        accountId: input.accountId,
        strategyInstanceId: instanceId,
        type: ledgerType,
        amount: totalAmount,
        occurredAt: input.occurredAt,
        description: `${input.action} ${input.quantity}x ${input.symbol} $${input.strike} ${input.callPut} @ $${input.price}`,
      },
    });

    // Fee entry
    if (input.fees > 0) {
      await tx.ledgerEntry.create({
        data: {
          accountId: input.accountId,
          strategyInstanceId: instanceId,
          type: LedgerType.FEE,
          amount: new Prisma.Decimal(input.fees),
          occurredAt: input.occurredAt,
          description: `Fee for ${input.action} ${input.symbol}`,
        },
      });
    }

    // Finalize if closing action
    if (!isOpening) {
      const reasonMap: Record<string, "CLOSED" | "EXPIRED" | "ASSIGNED" | "EXERCISED"> = {
        BTC: "CLOSED",
        STC: "CLOSED",
        EXPIRE: "EXPIRED",
        ASSIGN: "ASSIGNED",
        EXERCISE: "EXERCISED",
      };

      const reason = reasonMap[input.action];
      if (reason) {
        // Compute NROP inside this transaction
        const entries = await tx.ledgerEntry.findMany({
          where: { strategyInstanceId: instanceId },
        });

        let nrop = new Prisma.Decimal(0);
        for (const entry of entries) {
          if (entry.type === LedgerType.PREMIUM_CREDIT) nrop = nrop.plus(entry.amount);
          else if (entry.type === LedgerType.PREMIUM_DEBIT) nrop = nrop.minus(entry.amount);
          else if (entry.type === LedgerType.FEE) nrop = nrop.minus(entry.amount);
        }

        await tx.strategyInstance.update({
          where: { id: instanceId },
          data: {
            status: "FINALIZED",
            finalizationReason: reason,
            finalizedAt: input.occurredAt,
            realizedOptionProfit: nrop,
          },
        });
      }
    }

    return { instanceId };
  });
}
