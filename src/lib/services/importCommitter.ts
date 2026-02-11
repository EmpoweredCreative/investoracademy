import { LedgerType, InstrumentType, OptionAction, StockAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DedupeResult } from "./dedupeEngine";
import { createStockLot, consumeStockLots } from "./fifoLots";
import { finalizeInstance } from "./instanceFinalizer";

/**
 * Map an action string to a LedgerType.
 */
function mapToLedgerType(instrumentType: string, action: string): LedgerType {
  const a = action.toUpperCase();

  if (instrumentType === "STOCK") {
    if (a === "BUY") return LedgerType.STOCK_BUY;
    if (a === "SELL") return LedgerType.STOCK_SELL;
  }

  if (instrumentType === "OPTION") {
    // STO / STC are credits (selling); BTO / BTC are debits (buying)
    if (a === "STO" || a === "STC") return LedgerType.PREMIUM_CREDIT;
    if (a === "BTO" || a === "BTC") return LedgerType.PREMIUM_DEBIT;
    if (a === "EXPIRE" || a === "ASSIGN" || a === "EXERCISE") return LedgerType.FEE;
  }

  return LedgerType.ADJUSTMENT;
}

/**
 * Determine if an option action is a finalizing action.
 */
function isFinalizingAction(action: string): boolean {
  const a = action.toUpperCase();
  return ["BTC", "STC", "EXPIRE", "ASSIGN", "EXERCISE"].includes(a);
}

function mapFinalizationReason(action: string) {
  const a = action.toUpperCase();
  switch (a) {
    case "BTC":
    case "STC":
      return "CLOSED" as const;
    case "EXPIRE":
      return "EXPIRED" as const;
    case "ASSIGN":
      return "ASSIGNED" as const;
    case "EXERCISE":
      return "EXERCISED" as const;
    default:
      return null;
  }
}

/**
 * Commit validated and deduped CSV rows to the database.
 * Idempotent: skips duplicates safely.
 */
export async function commitImport(
  accountId: string,
  csvImportId: string,
  dedupeResults: DedupeResult[]
) {
  const newRows = dedupeResults.filter((r) => r.status === "NEW");

  if (newRows.length === 0) {
    await prisma.csvImport.update({
      where: { id: csvImportId },
      data: { committedAt: new Date(), newCount: 0, dupCount: dedupeResults.length },
    });
    return { committed: 0, skipped: dedupeResults.length };
  }

  return prisma.$transaction(async (tx) => {
    let committed = 0;

    for (const result of newRows) {
      const { row, fingerprint, externalRef } = result;
      const occurredAt = new Date(row.trade_datetime);
      const amount = new Prisma.Decimal(row.price).mul(new Prisma.Decimal(row.quantity));
      const fees = new Prisma.Decimal(row.fees || "0");

      // Ensure underlying exists
      const underlying = await tx.underlying.upsert({
        where: {
          accountId_symbol: { accountId, symbol: row.symbol.toUpperCase() },
        },
        create: { accountId, symbol: row.symbol.toUpperCase() },
        update: {},
      });

      if (row.instrument_type === "STOCK") {
        const action = row.action.toUpperCase() as StockAction;
        const ledgerType = mapToLedgerType("STOCK", action);

        // Create ledger entry
        await tx.ledgerEntry.create({
          data: {
            accountId,
            type: ledgerType,
            amount,
            occurredAt,
            externalRef,
            fingerprint,
            csvImportId,
            description: `${action} ${row.quantity} ${row.symbol} @ ${row.price}`,
          },
        });

        // Fee entry if fees > 0
        if (fees.greaterThan(0)) {
          await tx.ledgerEntry.create({
            data: {
              accountId,
              type: LedgerType.FEE,
              amount: fees,
              occurredAt,
              csvImportId,
              description: `Fee for ${action} ${row.symbol}`,
            },
          });
        }

        // FIFO lot processing
        if (action === "BUY") {
          await createStockLot(
            {
              accountId,
              underlyingId: underlying.id,
              quantity: Number(row.quantity),
              costBasis: amount.plus(fees).toNumber(),
              acquiredAt: occurredAt,
            },
            tx
          );
        } else if (action === "SELL") {
          await consumeStockLots(
            {
              accountId,
              underlyingId: underlying.id,
              quantity: Number(row.quantity),
              sellPrice: Number(row.price),
            },
            tx
          );
        }
      } else if (row.instrument_type === "OPTION") {
        const action = row.action.toUpperCase() as OptionAction;
        const isOpening = action === "STO" || action === "BTO";

        let instanceId: string;

        if (isOpening) {
          // Create new strategy instance
          const instance = await tx.strategyInstance.create({
            data: {
              accountId,
              underlyingId: underlying.id,
              instrumentType: "OPTION",
              optionAction: action,
              callPut: row.call_put?.toUpperCase() === "CALL" ? "CALL" : "PUT",
              longShort: action === "STO" ? "SHORT" : "LONG",
              strike: row.strike ? new Prisma.Decimal(row.strike) : null,
              expiration: row.expiration ? new Date(row.expiration) : null,
              quantity: new Prisma.Decimal(row.quantity),
              status: "OPEN",
            },
          });
          instanceId = instance.id;
        } else {
          // Find matching open instance to close
          const openInstance = await tx.strategyInstance.findFirst({
            where: {
              accountId,
              underlyingId: underlying.id,
              instrumentType: "OPTION",
              status: "OPEN",
              strike: row.strike ? new Prisma.Decimal(row.strike) : undefined,
              expiration: row.expiration ? new Date(row.expiration) : undefined,
              callPut: row.call_put?.toUpperCase() === "CALL" ? "CALL" : "PUT",
            },
            orderBy: { createdAt: "asc" },
          });

          if (!openInstance) {
            // Create a new instance if no matching open one found
            const instance = await tx.strategyInstance.create({
              data: {
                accountId,
                underlyingId: underlying.id,
                instrumentType: "OPTION",
                optionAction: action,
                callPut: row.call_put?.toUpperCase() === "CALL" ? "CALL" : "PUT",
                longShort: action === "BTC" ? "SHORT" : "LONG",
                strike: row.strike ? new Prisma.Decimal(row.strike) : null,
                expiration: row.expiration ? new Date(row.expiration) : null,
                quantity: new Prisma.Decimal(row.quantity),
                status: "OPEN",
              },
            });
            instanceId = instance.id;
          } else {
            instanceId = openInstance.id;
          }
        }

        const ledgerType = mapToLedgerType("OPTION", action);

        // Create ledger entry
        await tx.ledgerEntry.create({
          data: {
            accountId,
            strategyInstanceId: instanceId,
            type: ledgerType,
            amount,
            occurredAt,
            externalRef,
            fingerprint,
            csvImportId,
            description: `${action} ${row.quantity} ${row.symbol} ${row.strike ?? ""} ${row.call_put ?? ""} @ ${row.price}`,
          },
        });

        // Fee entry
        if (fees.greaterThan(0)) {
          await tx.ledgerEntry.create({
            data: {
              accountId,
              strategyInstanceId: instanceId,
              type: LedgerType.FEE,
              amount: fees,
              occurredAt,
              csvImportId,
              description: `Fee for ${action} ${row.symbol}`,
            },
          });
        }

        // Finalize if closing action
        if (isFinalizingAction(action)) {
          const reason = mapFinalizationReason(action);
          if (reason) {
            // We do this outside the transaction since finalizeInstance has its own
            // For now, just update directly
            await tx.strategyInstance.update({
              where: { id: instanceId },
              data: {
                status: "FINALIZED",
                finalizationReason: reason,
                finalizedAt: occurredAt,
              },
            });
          }
        }
      }

      committed++;
    }

    // Update CSV import record
    await tx.csvImport.update({
      where: { id: csvImportId },
      data: {
        committedAt: new Date(),
        newCount: committed,
        dupCount: dedupeResults.length - committed,
      },
    });

    return { committed, skipped: dedupeResults.length - committed };
  });
}
