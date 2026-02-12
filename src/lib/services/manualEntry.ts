import { LedgerType, OptionAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createStockLot, consumeStockLots, applyBasisReduction } from "./fifoLots";
import { finalizeInstance } from "./instanceFinalizer";
import { adjustCashBalance } from "./cashTracker";

interface StockEntryInput {
  accountId: string;
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  fees: number;
  occurredAt: Date;
  wheelCategory: "CORE" | "MAD_MONEY" | "FREE_CAPITAL" | "RISK_MGMT";
  notes?: string;
}

interface OptionLegInput {
  action: OptionAction;
  callPut: "CALL" | "PUT";
  strike: number;
  quantity: number;
  price: number;
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
  entryDelta?: number;
  fees: number;
  occurredAt: Date;
  strategyType?: string;
  premiumPolicyOverride?: "CASHFLOW" | "BASIS_REDUCTION" | "REINVEST_ON_CLOSE";
  wheelCategoryOverride?: "CORE" | "MAD_MONEY" | "FREE_CAPITAL" | "RISK_MGMT";
  notes?: string;
  additionalLegs?: OptionLegInput[];
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

    // Set or update the wealth wheel classification to the user-selected category
    await tx.wealthWheelClassification.upsert({
      where: { underlyingId: underlying.id },
      create: {
        accountId: input.accountId,
        underlyingId: underlying.id,
        category: input.wheelCategory,
      },
      update: {
        category: input.wheelCategory,
      },
    });

    // Auto-create a journal trade so the entry appears in the Journal
    await tx.journalTrade.create({
      data: {
        accountId: input.accountId,
        underlyingId: underlying.id,
        longShort: input.action === "BUY" ? "LONG" : "SHORT",
        quantity: input.quantity,
        entryPrice: input.price,
        entryDateTime: input.occurredAt,
        wheelCategoryOverride: input.wheelCategory,
        thesisNotes: input.notes ?? `${input.action} ${input.quantity} ${input.symbol} @ $${input.price}`,
      },
    });

    // Auto-adjust cash balance (only when onboarding is complete)
    if (input.action === "BUY") {
      // Stock purchase: deduct cost + fees
      await adjustCashBalance(tx, input.accountId, totalAmount.plus(input.fees).neg());
    } else {
      // Stock sale: add proceeds - fees
      await adjustCashBalance(tx, input.accountId, totalAmount.minus(input.fees));
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

    // Generate a group ID for multi-leg strategies
    const hasAdditionalLegs = input.additionalLegs && input.additionalLegs.length > 0;
    const strategyGroupId = hasAdditionalLegs
      ? `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      : undefined;

    let instanceId: string;

    if (isOpening) {
      const instance = await tx.strategyInstance.create({
        data: {
          accountId: input.accountId,
          underlyingId: underlying.id,
          instrumentType: "OPTION",
          strategyType: (input.strategyType as never) || null,
          strategyGroupId: strategyGroupId || null,
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

      // Auto-create a journal trade so the entry appears in the Journal
      await tx.journalTrade.create({
        data: {
          accountId: input.accountId,
          underlyingId: underlying.id,
          strategyInstanceId: instance.id,
          strike: new Prisma.Decimal(input.strike),
          callPut: input.callPut,
          longShort: input.action === "STO" ? "SHORT" : "LONG",
          quantity: input.quantity,
          entryDelta: input.entryDelta != null ? new Prisma.Decimal(input.entryDelta) : null,
          entryPrice: input.price,
          entryDateTime: input.occurredAt,
          wheelCategoryOverride: input.wheelCategoryOverride || null,
          thesisNotes: input.notes ?? `${input.action} ${input.quantity}x ${input.symbol} $${input.strike} ${input.callPut} @ $${input.price}`,
        },
      });
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

    // Auto-adjust cash balance for the primary leg (only when onboarding is complete)
    const feesDecimal = new Prisma.Decimal(input.fees);
    if (input.action === "STO" || input.action === "STC") {
      // Selling option: receive premium minus fees
      await adjustCashBalance(tx, input.accountId, totalAmount.minus(feesDecimal));
    } else if (input.action === "BTO" || input.action === "BTC") {
      // Buying option: pay premium plus fees
      await adjustCashBalance(tx, input.accountId, totalAmount.plus(feesDecimal).neg());
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

    // Process additional legs for multi-leg strategies
    if (isOpening && hasAdditionalLegs && input.additionalLegs) {
      for (const leg of input.additionalLegs) {
        const legIsOpening = leg.action === "STO" || leg.action === "BTO";
        if (!legIsOpening) continue; // only create instances for opening legs

        const legAmount = new Prisma.Decimal(leg.price).mul(leg.quantity).mul(100);

        const legInstance = await tx.strategyInstance.create({
          data: {
            accountId: input.accountId,
            underlyingId: underlying.id,
            instrumentType: "OPTION",
            strategyType: (input.strategyType as never) || null,
            strategyGroupId: strategyGroupId || null,
            optionAction: leg.action,
            callPut: leg.callPut,
            longShort: leg.action === "STO" ? "SHORT" : "LONG",
            strike: new Prisma.Decimal(leg.strike),
            expiration: input.expiration,
            quantity: new Prisma.Decimal(leg.quantity),
            premiumPolicyOverride: input.premiumPolicyOverride || null,
            wheelCategoryOverride: input.wheelCategoryOverride || null,
          },
        });

        const legLedgerType =
          leg.action === "STO" || leg.action === "STC"
            ? LedgerType.PREMIUM_CREDIT
            : LedgerType.PREMIUM_DEBIT;

        await tx.ledgerEntry.create({
          data: {
            accountId: input.accountId,
            strategyInstanceId: legInstance.id,
            type: legLedgerType,
            amount: legAmount,
            occurredAt: input.occurredAt,
            description: `${leg.action} ${leg.quantity}x ${input.symbol} $${leg.strike} ${leg.callPut} @ $${leg.price}`,
          },
        });

        // Auto-create a journal trade for this leg
        await tx.journalTrade.create({
          data: {
            accountId: input.accountId,
            underlyingId: underlying.id,
            strategyInstanceId: legInstance.id,
            strike: new Prisma.Decimal(leg.strike),
            callPut: leg.callPut,
            longShort: leg.action === "STO" ? "SHORT" : "LONG",
            quantity: leg.quantity,
            entryPrice: leg.price,
            entryDateTime: input.occurredAt,
            wheelCategoryOverride: input.wheelCategoryOverride || null,
            thesisNotes: `${leg.action} ${leg.quantity}x ${input.symbol} $${leg.strike} ${leg.callPut} @ $${leg.price}`,
          },
        });

        // Auto-adjust cash for this leg
        if (leg.action === "STO" || leg.action === "STC") {
          await adjustCashBalance(tx, input.accountId, legAmount);
        } else if (leg.action === "BTO" || leg.action === "BTC") {
          await adjustCashBalance(tx, input.accountId, legAmount.neg());
        }
      }
    }

    return { instanceId, strategyGroupId };
  });
}

/**
 * Backfill / repair financial records for journal option trades.
 *
 * Handles TWO cases:
 *
 * Case A — Orphaned trades (strategyInstanceId IS NULL):
 *   Creates StrategyInstance + LedgerEntries + applies basis reduction.
 *
 * Case B — Broken strategy instances (strategyInstanceId IS NOT NULL but data
 *   is inconsistent — e.g. wrong qty, OPEN when it should be FINALIZED,
 *   missing exit ledger entry, no NROP, no basis reduction):
 *   Tears down the old instance and rebuilds it correctly.
 *
 * Safe to call multiple times — idempotent once the data is correct.
 */
export async function backfillJournalOptionFinancials(accountId: string) {
  // Step 0: Clean up orphaned strategy instances (instances with no journal trade referencing them)
  // These can be left behind from previous partial backfill runs.
  const orphanedInstances = await prisma.strategyInstance.findMany({
    where: {
      accountId,
      instrumentType: "OPTION",
      journalTrade: null, // No journal trade references this instance
    },
    select: { id: true },
  });

  if (orphanedInstances.length > 0) {
    const orphanIds = orphanedInstances.map((i) => i.id);
    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.deleteMany({
        where: { strategyInstanceId: { in: orphanIds } },
      });
      await tx.reinvestSignal.deleteMany({
        where: { instanceId: { in: orphanIds } },
      });
      await tx.strategyInstance.deleteMany({
        where: { id: { in: orphanIds } },
      });
    });
  }

  // ─── Phase 1: Sync LONG options closed in Journal but instance still OPEN ───
  // When user closes a LEAP in Trade Journal, JournalTrade gets exitPrice but
  // StrategyInstance may stay OPEN. This syncs the portfolio/financial state.
  const longOptionTrades = await prisma.journalTrade.findMany({
    where: {
      accountId,
      strategyInstanceId: { not: null },
      exitPrice: { not: null },
      callPut: { not: null },
    },
    include: {
      underlying: true,
      strategyInstance: { include: { ledgerEntries: true } },
    },
  });

  const stuckLongTrades = longOptionTrades.filter((trade) => {
    const inst = trade.strategyInstance;
    if (!inst || inst.status !== "OPEN") return false;
    const isLong = trade.longShort === "LONG" || inst.longShort === "LONG";
    if (!isLong) return false;
    const exitPrice = parseFloat(trade.exitPrice!.toString());
    const hasStcCredit = inst.ledgerEntries.some(
      (e) => e.type === "PREMIUM_CREDIT" && e.description?.includes("STC")
    );
    return !hasStcCredit;
  });

  if (stuckLongTrades.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const trade of stuckLongTrades) {
        const inst = trade.strategyInstance!;
        const qty = trade.quantity ? parseFloat(trade.quantity.toString()) : 1;
        const exitPrice = parseFloat(trade.exitPrice!.toString());
        const exitDate = trade.exitDateTime ?? new Date();

        if (exitPrice > 0) {
          const premiumCredit = new Prisma.Decimal(exitPrice).mul(qty).mul(100);
          await tx.ledgerEntry.create({
            data: {
              accountId,
              strategyInstanceId: inst.id,
              type: LedgerType.PREMIUM_CREDIT,
              amount: premiumCredit,
              occurredAt: exitDate,
              description: `STC ${qty}x ${trade.underlying.symbol} $${inst.strike ?? ""} ${inst.callPut} @ $${exitPrice}`,
            },
          });
        }

        const allEntries = await tx.ledgerEntry.findMany({
          where: { strategyInstanceId: inst.id },
        });
        let nrop = new Prisma.Decimal(0);
        for (const entry of allEntries) {
          if (entry.type === LedgerType.PREMIUM_CREDIT) nrop = nrop.plus(entry.amount);
          else if (entry.type === LedgerType.PREMIUM_DEBIT) nrop = nrop.minus(entry.amount);
          else if (entry.type === LedgerType.FEE) nrop = nrop.minus(entry.amount);
        }

        await tx.strategyInstance.update({
          where: { id: inst.id },
          data: {
            status: "FINALIZED",
            finalizationReason: "CLOSED",
            finalizedAt: exitDate,
            realizedOptionProfit: nrop,
          },
        });

        if (nrop.greaterThan(0)) {
          await applyBasisReduction(
            { accountId, underlyingId: trade.underlyingId, premiumAmount: nrop },
            tx
          );
        }

        if (exitPrice > 0) {
          const proceeds = new Prisma.Decimal(exitPrice).mul(qty).mul(100);
          await adjustCashBalance(tx, accountId, proceeds);
        }
      }
    });
  }

  // ─── Phase 2: Short option trades (orphaned AND ones with existing instances) ───
  const allOptionTrades = await prisma.journalTrade.findMany({
    where: {
      accountId,
      longShort: "SHORT",
      callPut: { not: null },
    },
    include: {
      underlying: true,
      strategyInstance: { include: { ledgerEntries: true } },
    },
  });

  if (allOptionTrades.length === 0) return 0;

  // Determine which trades need work
  const tradesToProcess = allOptionTrades.filter((trade) => {
    // Case A: no strategy instance at all
    if (!trade.strategyInstanceId || !trade.strategyInstance) return true;

    const inst = trade.strategyInstance;
    const qty = trade.quantity ? parseFloat(trade.quantity.toString()) : 1;
    const entryPrice = trade.entryPrice ? parseFloat(trade.entryPrice.toString()) : 0;
    const exitPrice = trade.exitPrice ? parseFloat(trade.exitPrice.toString()) : null;
    const isClosed = exitPrice !== null;
    const instQty = inst.quantity ? parseFloat(inst.quantity.toString()) : 0;

    // Case B: strategy instance exists but is inconsistent
    // Check quantity mismatch
    if (Math.abs(instQty - qty) > 0.001) return true;

    // Check status mismatch (should be FINALIZED if journal has exit price)
    if (isClosed && inst.status !== "FINALIZED") return true;

    // Check missing NROP on finalized instance
    if (isClosed && inst.status === "FINALIZED" && inst.realizedOptionProfit === null) return true;

    // Check NROP value correctness
    if (isClosed && inst.realizedOptionProfit !== null) {
      const expectedNrop = (entryPrice - (exitPrice ?? 0)) * qty * 100;
      const actualNrop = parseFloat(inst.realizedOptionProfit.toString());
      if (Math.abs(actualNrop - expectedNrop) > 0.01) return true;
    }

    // Check missing premium credit ledger entry
    if (entryPrice > 0) {
      const hasPremiumCredit = inst.ledgerEntries.some((e) => e.type === "PREMIUM_CREDIT");
      if (!hasPremiumCredit) return true;

      // Check premium credit amount correctness
      const creditEntry = inst.ledgerEntries.find((e) => e.type === "PREMIUM_CREDIT");
      if (creditEntry) {
        const expectedCredit = entryPrice * qty * 100;
        const actualCredit = parseFloat(creditEntry.amount.toString());
        if (Math.abs(actualCredit - expectedCredit) > 0.01) return true;
      }
    }

    // Check missing premium debit on closed trade
    if (isClosed && exitPrice > 0) {
      const hasPremiumDebit = inst.ledgerEntries.some((e) => e.type === "PREMIUM_DEBIT");
      if (!hasPremiumDebit) return true;
    }

    // Instance looks correct
    return false;
  });

  if (tradesToProcess.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    let backfilled = 0;

    for (const trade of tradesToProcess) {
      const qty = trade.quantity ? parseFloat(trade.quantity.toString()) : 1;
      const entryPrice = trade.entryPrice ? parseFloat(trade.entryPrice.toString()) : 0;
      const exitPrice = trade.exitPrice ? parseFloat(trade.exitPrice.toString()) : null;
      const isClosed = exitPrice !== null;

      // Case B: Tear down broken strategy instance first
      if (trade.strategyInstanceId && trade.strategyInstance) {
        const oldInst = trade.strategyInstance;

        // Reverse any existing basis reduction
        if (oldInst.realizedOptionProfit) {
          const oldNrop = parseFloat(oldInst.realizedOptionProfit.toString());
          if (oldNrop > 0) {
            await applyBasisReduction(
              {
                accountId,
                underlyingId: trade.underlyingId,
                premiumAmount: new Prisma.Decimal(oldNrop).neg(),
              },
              tx
            );
          }
        }

        // Delete old ledger entries
        await tx.ledgerEntry.deleteMany({
          where: { strategyInstanceId: trade.strategyInstanceId },
        });

        // Delete reinvest signals
        await tx.reinvestSignal.deleteMany({
          where: { instanceId: trade.strategyInstanceId },
        });

        // Unlink from journal trade first, then delete instance
        await tx.journalTrade.update({
          where: { id: trade.id },
          data: { strategyInstanceId: null },
        });

        await tx.strategyInstance.delete({
          where: { id: trade.strategyInstanceId },
        });
      }

      // Create fresh strategy instance
      const instance = await tx.strategyInstance.create({
        data: {
          accountId,
          underlyingId: trade.underlyingId,
          instrumentType: "OPTION",
          optionAction: "STO",
          callPut: trade.callPut!,
          longShort: "SHORT",
          strike: trade.strike ?? undefined,
          quantity: qty,
          status: isClosed ? "FINALIZED" : "OPEN",
          finalizationReason: isClosed ? "CLOSED" : undefined,
          finalizedAt: isClosed ? (trade.exitDateTime ?? new Date()) : undefined,
        },
      });

      // Opening premium credit
      if (entryPrice > 0) {
        const premiumCredit = new Prisma.Decimal(entryPrice).mul(qty).mul(100);
        await tx.ledgerEntry.create({
          data: {
            accountId,
            strategyInstanceId: instance.id,
            type: LedgerType.PREMIUM_CREDIT,
            amount: premiumCredit,
            occurredAt: trade.entryDateTime ?? new Date(),
            description: `STO ${qty}x ${trade.underlying.symbol} $${trade.strike ?? ""} ${trade.callPut} @ $${entryPrice}`,
          },
        });
      }

      // Closing premium debit
      if (isClosed && exitPrice > 0) {
        const premiumDebit = new Prisma.Decimal(exitPrice).mul(qty).mul(100);
        await tx.ledgerEntry.create({
          data: {
            accountId,
            strategyInstanceId: instance.id,
            type: LedgerType.PREMIUM_DEBIT,
            amount: premiumDebit,
            occurredAt: trade.exitDateTime ?? new Date(),
            description: `BTC ${qty}x ${trade.underlying.symbol} $${trade.strike ?? ""} ${trade.callPut} @ $${exitPrice}`,
          },
        });
      }

      // Compute NROP and apply basis reduction if closed
      if (isClosed) {
        const nrop = new Prisma.Decimal(entryPrice).minus(exitPrice).mul(qty).mul(100);

        await tx.strategyInstance.update({
          where: { id: instance.id },
          data: { realizedOptionProfit: nrop },
        });

        if (nrop.greaterThan(0)) {
          await applyBasisReduction(
            { accountId, underlyingId: trade.underlyingId, premiumAmount: nrop },
            tx
          );
        }
      }

      // Link journal trade to the new strategy instance
      await tx.journalTrade.update({
        where: { id: trade.id },
        data: { strategyInstanceId: instance.id },
      });

      backfilled++;
    }

    return backfilled;
  });
}
