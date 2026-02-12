import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { journalTradeSchema } from "@/lib/validations";
import { applyBasisReduction, consumeStockLots, createStockLot } from "@/lib/services/fifoLots";
import { adjustCashBalance } from "@/lib/services/cashTracker";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const instrumentType = searchParams.get("type"); // "stock" or "options"

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Build instrument-type filter: stock = no callPut, options = has callPut
    const typeFilter =
      instrumentType === "stock"
        ? { callPut: null }
        : instrumentType === "options"
          ? { callPut: { not: null } }
          : {};

    const trades = await prisma.journalTrade.findMany({
      where: {
        accountId,
        ...typeFilter,
      },
      include: {
        underlying: {
          include: {
            wheelClassification: true,
          },
        },
        strategyInstance: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Resolve effective wheel category for each trade:
    // 1. wheelCategoryOverride on the JournalTrade
    // 2. underlying's WealthWheelClassification
    // 3. default MAD_MONEY
    const tradesWithCategory = trades.map((trade) => {
      const effectiveCategory =
        trade.wheelCategoryOverride ??
        trade.underlying.wheelClassification?.category ??
        "MAD_MONEY";
      return {
        ...trade,
        effectiveWheelCategory: effectiveCategory,
      };
    });

    return NextResponse.json(tradesWithCategory);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = await req.json();
    const data = journalTradeSchema.parse(body);
    const { fees = 0, ...journalData } = data;

    const trade = await prisma.$transaction(async (tx) => {
      // Create the journal trade (fees not stored on JournalTrade; used for LedgerEntry)
      const journalTrade = await tx.journalTrade.create({
        data: {
          accountId,
          ...journalData,
          strike: journalData.strike ?? undefined,
          entryDateTime: journalData.entryDateTime ? new Date(journalData.entryDateTime) : undefined,
          exitDateTime: journalData.exitDateTime ? new Date(journalData.exitDateTime) : undefined,
        },
      });

      // For short option trades (covered calls / short puts), create financial records
      if (data.callPut && data.longShort === "SHORT") {
        await createOptionFinancials(tx, accountId, journalTrade.id, { ...data, fees });
      }

      return journalTrade;
    });

    return NextResponse.json(trade, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = await req.json();
    const { tradeId, ...fields } = body;

    if (!tradeId || typeof tradeId !== "string") {
      return NextResponse.json({ error: "tradeId is required" }, { status: 400 });
    }

    const existing = await prisma.journalTrade.findFirst({
      where: { id: tradeId, accountId },
      include: { strategyInstance: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
    }

    const data = journalTradeSchema.partial().parse(fields);

    const updated = await prisma.$transaction(async (tx) => {
      // Build the update payload, properly handling null (clear) vs undefined (no change)
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue; // field not sent — skip
        if (key === "strike") {
          updateData[key] = value; // null clears, number sets
        } else if (key === "entryDateTime" || key === "exitDateTime") {
          updateData[key] = value !== null ? new Date(value as string) : null;
        } else {
          updateData[key] = value;
        }
      }

      const journalTrade = await tx.journalTrade.update({
        where: { id: tradeId },
        data: updateData,
      });

      // Resolve the effective callPut and longShort (from update, existing record, or strategy instance)
      let effectiveCallPut = data.callPut === null ? null : (data.callPut ?? existing.callPut);
      let effectiveLongShort = data.longShort ?? existing.longShort;
      if (existing.strategyInstance) {
        if (!effectiveCallPut) effectiveCallPut = existing.strategyInstance.callPut;
        if (!effectiveLongShort) effectiveLongShort = existing.strategyInstance.longShort;
      }

      // Case A: Short option trade with NO strategy instance — create financials from scratch
      if (effectiveCallPut && effectiveLongShort === "SHORT" && !existing.strategyInstanceId) {
        const merged = {
          underlyingId: data.underlyingId ?? existing.underlyingId,
          callPut: effectiveCallPut as "CALL" | "PUT",
          longShort: "SHORT" as const,
          strike: data.strike !== undefined ? data.strike : (existing.strike ? parseFloat(existing.strike.toString()) : undefined),
          quantity: data.quantity !== undefined ? data.quantity : (existing.quantity ? parseFloat(existing.quantity.toString()) : undefined),
          entryPrice: data.entryPrice !== undefined ? data.entryPrice : (existing.entryPrice ? parseFloat(existing.entryPrice.toString()) : undefined),
          exitPrice: data.exitPrice !== undefined ? data.exitPrice : (existing.exitPrice ? parseFloat(existing.exitPrice.toString()) : undefined),
          entryDateTime: data.entryDateTime ?? existing.entryDateTime?.toISOString(),
          exitDateTime: data.exitDateTime ?? existing.exitDateTime?.toISOString(),
          fees: data.fees ?? 0,
        };
        await createOptionFinancials(tx, accountId, tradeId, merged);
      }

      // Case B: Short option trade WITH an OPEN strategy instance being closed (exit info added)
      if (
        effectiveCallPut &&
        effectiveLongShort === "SHORT" &&
        existing.strategyInstanceId &&
        data.exitPrice !== undefined &&
        data.exitPrice !== null &&
        !existing.exitPrice // wasn't closed before
      ) {
        const instance = await tx.strategyInstance.findUnique({
          where: { id: existing.strategyInstanceId },
        });

        if (instance && instance.status === "OPEN") {
          const underlying = await tx.underlying.findFirst({
            where: { id: existing.underlyingId, accountId },
          });

          const qty = existing.quantity ? parseFloat(existing.quantity.toString()) : 1;
          const exitPrice = data.exitPrice;
          const exitDate = data.exitDateTime ? new Date(data.exitDateTime) : new Date();

          // Create closing premium debit ledger entry
          if (exitPrice > 0) {
            const premiumDebit = new Prisma.Decimal(exitPrice).mul(qty).mul(100);
            await tx.ledgerEntry.create({
              data: {
                accountId,
                strategyInstanceId: instance.id,
                type: "PREMIUM_DEBIT",
                amount: premiumDebit,
                occurredAt: exitDate,
                description: `BTC ${qty}x ${underlying?.symbol ?? ""} $${instance.strike ?? ""} ${instance.callPut} @ $${exitPrice}`,
              },
            });
          }

          // Calculate NROP from all ledger entries
          const allEntries = await tx.ledgerEntry.findMany({
            where: { strategyInstanceId: instance.id },
          });
          let nrop = new Prisma.Decimal(0);
          for (const entry of allEntries) {
            if (entry.type === "PREMIUM_CREDIT") nrop = nrop.plus(entry.amount);
            else if (entry.type === "PREMIUM_DEBIT") nrop = nrop.minus(entry.amount);
            else if (entry.type === "FEE") nrop = nrop.minus(entry.amount);
          }

          // Finalize the strategy instance
          await tx.strategyInstance.update({
            where: { id: instance.id },
            data: {
              status: "FINALIZED",
              finalizationReason: "CLOSED",
              finalizedAt: exitDate,
              realizedOptionProfit: nrop,
            },
          });

          // Apply basis reduction for profitable trades
          if (nrop.greaterThan(0)) {
            await applyBasisReduction(
              { accountId, underlyingId: existing.underlyingId, premiumAmount: nrop },
              tx
            );
          }

          // Deduct exit premium from cash (BTC = paying premium)
          if (exitPrice > 0) {
            const exitCost = new Prisma.Decimal(exitPrice).mul(qty).mul(100);
            await adjustCashBalance(tx, accountId, exitCost.neg());
          }
        }
      }

      // Case B2: Long option trade (LEAP, BTO/STC) WITH an OPEN strategy instance being closed
      if (
        effectiveCallPut &&
        effectiveLongShort === "LONG" &&
        existing.strategyInstanceId &&
        data.exitPrice !== undefined &&
        data.exitPrice !== null &&
        !existing.exitPrice // wasn't closed before
      ) {
        const instance = await tx.strategyInstance.findUnique({
          where: { id: existing.strategyInstanceId },
        });

        if (instance && instance.status === "OPEN") {
          const underlying = await tx.underlying.findFirst({
            where: { id: existing.underlyingId, accountId },
          });

          const qty = existing.quantity ? parseFloat(existing.quantity.toString()) : 1;
          const exitPrice = data.exitPrice;
          const exitDate = data.exitDateTime ? new Date(data.exitDateTime) : new Date();

          // Create closing premium credit ledger entry (STC = receive premium)
          if (exitPrice > 0) {
            const premiumCredit = new Prisma.Decimal(exitPrice).mul(qty).mul(100);
            await tx.ledgerEntry.create({
              data: {
                accountId,
                strategyInstanceId: instance.id,
                type: "PREMIUM_CREDIT",
                amount: premiumCredit,
                occurredAt: exitDate,
                description: `STC ${qty}x ${underlying?.symbol ?? ""} $${instance.strike ?? ""} ${instance.callPut} @ $${exitPrice}`,
              },
            });
          }

          // Calculate NROP from all ledger entries (CREDIT - DEBIT - FEE)
          const allEntries = await tx.ledgerEntry.findMany({
            where: { strategyInstanceId: instance.id },
          });
          let nrop = new Prisma.Decimal(0);
          for (const entry of allEntries) {
            if (entry.type === "PREMIUM_CREDIT") nrop = nrop.plus(entry.amount);
            else if (entry.type === "PREMIUM_DEBIT") nrop = nrop.minus(entry.amount);
            else if (entry.type === "FEE") nrop = nrop.minus(entry.amount);
          }

          // Finalize the strategy instance
          await tx.strategyInstance.update({
            where: { id: instance.id },
            data: {
              status: "FINALIZED",
              finalizationReason: "CLOSED",
              finalizedAt: exitDate,
              realizedOptionProfit: nrop,
            },
          });

          // Apply basis reduction for profitable trades (matches Case B behavior)
          if (nrop.greaterThan(0)) {
            await applyBasisReduction(
              { accountId, underlyingId: existing.underlyingId, premiumAmount: nrop },
              tx
            );
          }

          // Add sale proceeds to cash (STC = receive premium minus fees)
          if (exitPrice > 0) {
            const proceeds = new Prisma.Decimal(exitPrice).mul(qty).mul(100);
            await adjustCashBalance(tx, accountId, proceeds);
          }
        }
      }

      // Case C: Re-opening a closed trade (exit price cleared to null)
      if (
        effectiveCallPut &&
        effectiveLongShort === "SHORT" &&
        existing.strategyInstanceId &&
        data.exitPrice === null &&
        existing.exitPrice // was closed before
      ) {
        const instance = await tx.strategyInstance.findUnique({
          where: { id: existing.strategyInstanceId },
        });

        if (instance && instance.status === "FINALIZED") {
          // Reverse basis reduction if NROP was positive
          if (instance.realizedOptionProfit) {
            const oldNrop = parseFloat(instance.realizedOptionProfit.toString());
            if (oldNrop > 0) {
              await applyBasisReduction(
                {
                  accountId,
                  underlyingId: existing.underlyingId,
                  premiumAmount: new Prisma.Decimal(oldNrop).neg(),
                },
                tx
              );
            }
          }

          // Delete closing PREMIUM_DEBIT ledger entries
          await tx.ledgerEntry.deleteMany({
            where: {
              strategyInstanceId: instance.id,
              type: "PREMIUM_DEBIT",
            },
          });

          // Reverse the exit premium cash deduction (add it back)
          if (existing.exitPrice) {
            const oldExitPrice = parseFloat(existing.exitPrice.toString());
            if (oldExitPrice > 0) {
              const qty = existing.quantity ? parseFloat(existing.quantity.toString()) : 1;
              const reversedAmount = new Prisma.Decimal(oldExitPrice).mul(qty).mul(100);
              await adjustCashBalance(tx, accountId, reversedAmount);
            }
          }

          // Re-open the strategy instance
          await tx.strategyInstance.update({
            where: { id: instance.id },
            data: {
              status: "OPEN",
              finalizationReason: null,
              finalizedAt: null,
              realizedOptionProfit: null,
            },
          });
        }
      }

      // Case C2: Re-opening a closed LONG option trade (exit price cleared to null)
      if (
        effectiveCallPut &&
        effectiveLongShort === "LONG" &&
        existing.strategyInstanceId &&
        data.exitPrice === null &&
        existing.exitPrice // was closed before
      ) {
        const instance = await tx.strategyInstance.findUnique({
          where: { id: existing.strategyInstanceId },
        });

        if (instance && instance.status === "FINALIZED") {
          // Reverse basis reduction if NROP was positive
          if (instance.realizedOptionProfit) {
            const oldNrop = parseFloat(instance.realizedOptionProfit.toString());
            if (oldNrop > 0) {
              await applyBasisReduction(
                {
                  accountId,
                  underlyingId: existing.underlyingId,
                  premiumAmount: new Prisma.Decimal(oldNrop).neg(),
                },
                tx
              );
            }
          }

          // Delete only the STC closing PREMIUM_CREDIT (don't remove other credits e.g. from rolls)
          await tx.ledgerEntry.deleteMany({
            where: {
              strategyInstanceId: instance.id,
              type: "PREMIUM_CREDIT",
              description: { contains: "STC" },
            },
          });

          // Reverse the exit premium cash addition (subtract what we added)
          if (existing.exitPrice) {
            const oldExitPrice = parseFloat(existing.exitPrice.toString());
            if (oldExitPrice > 0) {
              const qty = existing.quantity ? parseFloat(existing.quantity.toString()) : 1;
              const reversedAmount = new Prisma.Decimal(oldExitPrice).mul(qty).mul(100);
              await adjustCashBalance(tx, accountId, reversedAmount.neg());
            }
          }

          // Re-open the strategy instance
          await tx.strategyInstance.update({
            where: { id: instance.id },
            data: {
              status: "OPEN",
              finalizationReason: null,
              finalizedAt: null,
              realizedOptionProfit: null,
            },
          });
        }
      }

      // ─── Stock trade exit/close handling ───────────────────────────

      // Case D: Stock trade being closed (exit price added)
      if (
        !effectiveCallPut && // stock trade (no option type)
        data.exitPrice !== undefined &&
        data.exitPrice !== null &&
        !existing.exitPrice // wasn't closed before
      ) {
        const qty = existing.quantity ? parseFloat(existing.quantity.toString()) : 0;
        const exitPrice = data.exitPrice;
        const exitDate = data.exitDateTime ? new Date(data.exitDateTime) : new Date();

        if (qty > 0) {
          const underlying = await tx.underlying.findFirst({
            where: { id: existing.underlyingId, accountId },
          });

          // Consume stock lots via FIFO
          await consumeStockLots(
            {
              accountId,
              underlyingId: existing.underlyingId,
              quantity: qty,
              sellPrice: exitPrice,
            },
            tx
          );

          // Create STOCK_SELL ledger entry
          const totalProceeds = new Prisma.Decimal(exitPrice).mul(qty);
          await tx.ledgerEntry.create({
            data: {
              accountId,
              type: "STOCK_SELL",
              amount: totalProceeds,
              occurredAt: exitDate,
              description: `SELL ${qty} ${underlying?.symbol ?? ""} @ $${exitPrice}`,
            },
          });

          // Adjust cash balance (add sale proceeds)
          await adjustCashBalance(tx, accountId, totalProceeds);
        }
      }

      // Case E: Stock trade being re-opened (exit price cleared to null)
      // Only reverses if a STOCK_SELL ledger entry exists (i.e., Case D previously ran).
      // If the exit was set before the stock-exit feature existed, this is a no-op
      // so the subsequent re-entry via Case D can consume the lots for the first time.
      if (
        !effectiveCallPut && // stock trade (no option type)
        data.exitPrice === null &&
        existing.exitPrice // was closed before
      ) {
        const qty = existing.quantity ? parseFloat(existing.quantity.toString()) : 0;
        const oldExitPrice = parseFloat(existing.exitPrice.toString());
        const entryPrice = existing.entryPrice ? parseFloat(existing.entryPrice.toString()) : 0;
        const entryDate = existing.entryDateTime ?? new Date();

        if (qty > 0) {
          // Check if a STOCK_SELL ledger entry exists from a prior Case D
          const underlying = await tx.underlying.findFirst({
            where: { id: existing.underlyingId, accountId },
          });
          const sellDescription = `SELL ${qty} ${underlying?.symbol ?? ""} @ $${oldExitPrice}`;
          const sellEntry = await tx.ledgerEntry.findFirst({
            where: {
              accountId,
              type: "STOCK_SELL",
              description: sellDescription,
            },
            orderBy: { createdAt: "desc" },
          });

          // Only reverse if stock lots were actually consumed (sell entry exists)
          if (sellEntry) {
            // Re-create the stock lot with original entry cost
            const totalCost = new Prisma.Decimal(entryPrice).mul(qty);
            await createStockLot(
              {
                accountId,
                underlyingId: existing.underlyingId,
                quantity: qty,
                costBasis: totalCost.toNumber(),
                acquiredAt: entryDate instanceof Date ? entryDate : new Date(entryDate),
              },
              tx
            );

            // Delete the STOCK_SELL ledger entry
            await tx.ledgerEntry.delete({ where: { id: sellEntry.id } });

            // Reverse cash adjustment (subtract the sale proceeds that were added)
            const reversedProceeds = new Prisma.Decimal(oldExitPrice).mul(qty);
            await adjustCashBalance(tx, accountId, reversedProceeds.neg());
          }
        }
      }

      return journalTrade;
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const tradeId = searchParams.get("tradeId");

    if (!tradeId) {
      return NextResponse.json({ error: "tradeId is required" }, { status: 400 });
    }

    const existing = await prisma.journalTrade.findFirst({
      where: { id: tradeId, accountId },
      include: { strategyInstance: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
    }

    // Collect strategy instance IDs to clean up
    const instanceIdsToDelete: string[] = [];

    if (existing.strategyInstanceId) {
      // If this instance belongs to a multi-leg strategy group, delete all legs
      if (existing.strategyInstance?.strategyGroupId) {
        const groupInstances = await prisma.strategyInstance.findMany({
          where: {
            accountId,
            strategyGroupId: existing.strategyInstance.strategyGroupId,
          },
          select: { id: true },
        });
        instanceIdsToDelete.push(...groupInstances.map((i) => i.id));
      } else {
        instanceIdsToDelete.push(existing.strategyInstanceId);
      }
    }

    // Use a transaction to delete everything atomically
    await prisma.$transaction(async (tx) => {
      // 0. Undo basis reduction for finalized option instances with positive NROP
      if (instanceIdsToDelete.length > 0) {
        const instances = await tx.strategyInstance.findMany({
          where: { id: { in: instanceIdsToDelete }, status: "FINALIZED" },
          select: { underlyingId: true, realizedOptionProfit: true },
        });
        for (const inst of instances) {
          if (inst.realizedOptionProfit && parseFloat(inst.realizedOptionProfit.toString()) > 0) {
            // Reverse the basis reduction by applying a negative amount
            await applyBasisReduction(
              {
                accountId,
                underlyingId: inst.underlyingId,
                premiumAmount: new Prisma.Decimal(inst.realizedOptionProfit.toString()).neg(),
              },
              tx
            );
          }
        }
      }

      // 0b. Reverse cash impact of ledger entries being deleted
      if (instanceIdsToDelete.length > 0) {
        const ledgerEntries = await tx.ledgerEntry.findMany({
          where: { strategyInstanceId: { in: instanceIdsToDelete } },
          select: { type: true, amount: true },
        });

        let cashReversal = new Prisma.Decimal(0);
        for (const entry of ledgerEntries) {
          if (entry.type === "PREMIUM_CREDIT" || entry.type === "STOCK_SELL") {
            // These added cash — reverse by subtracting
            cashReversal = cashReversal.minus(entry.amount);
          } else if (entry.type === "PREMIUM_DEBIT" || entry.type === "STOCK_BUY" || entry.type === "FEE") {
            // These deducted cash — reverse by adding
            cashReversal = cashReversal.plus(entry.amount);
          }
        }

        if (!cashReversal.isZero()) {
          await adjustCashBalance(tx, accountId, cashReversal);
        }
      }

      // 1. Delete the journal trade first (it references the strategy instance)
      await tx.journalTrade.delete({ where: { id: tradeId } });

      if (instanceIdsToDelete.length > 0) {
        // 2. Delete ledger entries linked to these strategy instances
        await tx.ledgerEntry.deleteMany({
          where: { strategyInstanceId: { in: instanceIdsToDelete } },
        });

        // 3. Delete reinvest signals linked to these strategy instances
        await tx.reinvestSignal.deleteMany({
          where: { instanceId: { in: instanceIdsToDelete } },
        });

        // 4. Delete the strategy instances themselves
        await tx.strategyInstance.deleteMany({
          where: { id: { in: instanceIdsToDelete } },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── Helper: create financial records for option journal trades ──

/**
 * When a short option (covered call or short put) is entered through the
 * journal, create the corresponding StrategyInstance and LedgerEntry records
 * so the premium flows into the account statement, portfolio cost basis, and
 * stock lot premium reduction.
 */
async function createOptionFinancials(
  tx: Prisma.TransactionClient,
  accountId: string,
  journalTradeId: string,
  data: {
    underlyingId: string;
    callPut: "CALL" | "PUT";
    longShort: string;
    strike?: number | null;
    quantity?: number | null;
    entryPrice?: number | null;
    exitPrice?: number | null;
    entryDateTime?: string | null;
    exitDateTime?: string | null;
    fees?: number;
  }
) {
  const underlying = await tx.underlying.findFirst({
    where: { id: data.underlyingId, accountId },
  });
  if (!underlying) return;

  const qty = data.quantity ?? 1;
  const entryPrice = data.entryPrice ?? 0;
  const exitPrice = data.exitPrice ?? null;
  const isClosed = exitPrice !== null && exitPrice !== undefined;

  // Create strategy instance
  const instance = await tx.strategyInstance.create({
    data: {
      accountId,
      underlyingId: data.underlyingId,
      instrumentType: "OPTION",
      optionAction: "STO",
      callPut: data.callPut,
      longShort: "SHORT",
      strike: data.strike ?? undefined,
      quantity: qty,
      status: isClosed ? "FINALIZED" : "OPEN",
      finalizationReason: isClosed ? "CLOSED" : undefined,
      finalizedAt: isClosed
        ? (data.exitDateTime ? new Date(data.exitDateTime) : new Date())
        : undefined,
    },
  });

  // Opening premium credit (STO)
  if (entryPrice > 0) {
    const premiumCredit = new Prisma.Decimal(entryPrice).mul(qty).mul(100);
    await tx.ledgerEntry.create({
      data: {
        accountId,
        strategyInstanceId: instance.id,
        type: "PREMIUM_CREDIT",
        amount: premiumCredit,
        occurredAt: data.entryDateTime ? new Date(data.entryDateTime) : new Date(),
        description: `STO ${qty}x ${underlying.symbol} $${data.strike ?? ""} ${data.callPut} @ $${entryPrice}`,
      },
    });
  }

  // Fee entry (cost of trade — reduces net profit)
  const feesAmount = data.fees ?? 0;
  if (feesAmount > 0) {
    await tx.ledgerEntry.create({
      data: {
        accountId,
        strategyInstanceId: instance.id,
        type: "FEE",
        amount: new Prisma.Decimal(feesAmount),
        occurredAt: data.entryDateTime ? new Date(data.entryDateTime) : new Date(),
        description: `Fee for STO ${underlying.symbol}`,
      },
    });
  }

  // Closing premium debit (BTC) if trade is closed
  if (isClosed && exitPrice > 0) {
    const premiumDebit = new Prisma.Decimal(exitPrice).mul(qty).mul(100);
    await tx.ledgerEntry.create({
      data: {
        accountId,
        strategyInstanceId: instance.id,
        type: "PREMIUM_DEBIT",
        amount: premiumDebit,
        occurredAt: data.exitDateTime ? new Date(data.exitDateTime) : new Date(),
        description: `BTC ${qty}x ${underlying.symbol} $${data.strike ?? ""} ${data.callPut} @ $${exitPrice}`,
      },
    });
  }

  // Compute NROP and finalize if closed (CREDIT - DEBIT - FEE)
  if (isClosed) {
    const allEntries = await tx.ledgerEntry.findMany({
      where: { strategyInstanceId: instance.id },
    });
    let nrop = new Prisma.Decimal(0);
    for (const entry of allEntries) {
      if (entry.type === "PREMIUM_CREDIT") nrop = nrop.plus(entry.amount);
      else if (entry.type === "PREMIUM_DEBIT") nrop = nrop.minus(entry.amount);
      else if (entry.type === "FEE") nrop = nrop.minus(entry.amount);
    }

    await tx.strategyInstance.update({
      where: { id: instance.id },
      data: { realizedOptionProfit: nrop },
    });

    // Apply premium as basis reduction to stock lots for the underlying
    if (nrop.greaterThan(0)) {
      await applyBasisReduction(
        {
          accountId,
          underlyingId: data.underlyingId,
          premiumAmount: nrop,
        },
        tx
      );
    }
  }

  // Link journal trade to strategy instance
  await tx.journalTrade.update({
    where: { id: journalTradeId },
    data: { strategyInstanceId: instance.id },
  });
}
