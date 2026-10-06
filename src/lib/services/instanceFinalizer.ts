import { FinalizationReason } from "@prisma/client";
import { prisma } from "@/lib/db";
import { settleOptionInstance } from "./premiumSettlement";

interface FinalizeInput {
  instanceId: string;
  reason: FinalizationReason;
  finalizedAt: Date;
}

/**
 * Finalize a StrategyInstance in its own transaction.
 * Inside an existing transaction, call settleOptionInstance(tx, …) directly.
 */
export async function finalizeInstance(input: FinalizeInput) {
  return prisma.$transaction((tx) => settleOptionInstance(tx, input));
}
