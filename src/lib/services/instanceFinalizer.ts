import { FinalizationReason, LedgerType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolvePolicy } from "./policyResolver";
import { createReinvestSignal } from "./reinvestSignals";
import { applyBasisReduction } from "./fifoLots";

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

    // Apply policy-based actions if there's net profit
    const policy = await resolvePolicy(instanceId);

    if (nrop.greaterThan(0)) {
      if (policy === "REINVEST_ON_CLOSE") {
        // Create signal to buy more shares with the premium
        const dueAt = new Date(finalizedAt.getTime() + 48 * 60 * 60 * 1000);
        await createReinvestSignal({
          accountId: instance.accountId,
          underlyingId: instance.underlyingId,
          instanceId,
          amount: nrop,
          dueAt,
        }, tx);
      } else if (policy === "BASIS_REDUCTION") {
        // Apply premium to reduce cost basis of existing stock lots
        await applyBasisReduction({
          accountId: instance.accountId,
          underlyingId: instance.underlyingId,
          premiumAmount: nrop,
        }, tx);
      }
      // CASHFLOW: no action — premium stays as cash in the account
    }

    return updated;
  });
}
