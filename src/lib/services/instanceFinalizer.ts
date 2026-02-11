import { FinalizationReason, LedgerType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolvePolicy } from "./policyResolver";
import { createReinvestSignal } from "./reinvestSignals";

interface FinalizeInput {
  instanceId: string;
  reason: FinalizationReason;
  finalizedAt: Date;
}

/**
 * Finalize a StrategyInstance:
 *   1. Compute Net Realized Option Profit (NROP)
 *   2. Update instance status
 *   3. Create ReinvestSignal if policy = REINVEST_ON_CLOSE and NROP > 0
 */
export async function finalizeInstance({ instanceId, reason, finalizedAt }: FinalizeInput) {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.strategyInstance.findUniqueOrThrow({
      where: { id: instanceId },
      include: { ledgerEntries: true },
    });

    if (instance.status === "FINALIZED") {
      throw new Error(`Instance ${instanceId} is already finalized`);
    }

    // Compute NROP = Sum(PREMIUM_CREDIT) - Sum(PREMIUM_DEBIT) - Sum(FEE)
    let nrop = new Prisma.Decimal(0);
    for (const entry of instance.ledgerEntries) {
      if (entry.type === LedgerType.PREMIUM_CREDIT) {
        nrop = nrop.plus(entry.amount);
      } else if (entry.type === LedgerType.PREMIUM_DEBIT) {
        nrop = nrop.minus(entry.amount);
      } else if (entry.type === LedgerType.FEE) {
        nrop = nrop.minus(entry.amount);
      }
    }

    // Update instance
    const updated = await tx.strategyInstance.update({
      where: { id: instanceId },
      data: {
        status: "FINALIZED",
        finalizationReason: reason,
        finalizedAt,
        realizedOptionProfit: nrop,
      },
    });

    // Check if reinvest signal should be created
    const policy = await resolvePolicy(instanceId);
    if (policy === "REINVEST_ON_CLOSE" && nrop.greaterThan(0)) {
      const dueAt = new Date(finalizedAt.getTime() + 48 * 60 * 60 * 1000);
      await createReinvestSignal({
        accountId: instance.accountId,
        underlyingId: instance.underlyingId,
        instanceId,
        amount: nrop,
        dueAt,
      }, tx);
    }

    return updated;
  });
}
