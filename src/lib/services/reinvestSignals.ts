import { ReinvestAction, ReinvestStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

interface CreateSignalInput {
  accountId: string;
  underlyingId: string;
  instanceId: string;
  amount: Prisma.Decimal;
  dueAt: Date;
}

type TxClient = Prisma.TransactionClient;

/**
 * Create a ReinvestSignal (called from instanceFinalizer).
 */
export async function createReinvestSignal(input: CreateSignalInput, tx?: TxClient) {
  const db = tx ?? prisma;
  return db.reinvestSignal.upsert({
    where: { instanceId: input.instanceId },
    create: {
      accountId: input.accountId,
      underlyingId: input.underlyingId,
      instanceId: input.instanceId,
      amount: input.amount,
      dueAt: input.dueAt,
      status: "CREATED",
    },
    update: {},
  });
}

/**
 * Process a ReinvestAction on a signal.
 */
export async function processReinvestAction(
  signalId: string,
  action: ReinvestAction,
  partialAmount?: number,
  notes?: string
) {
  const signal = await prisma.reinvestSignal.findUniqueOrThrow({
    where: { id: signalId },
  });

  let newStatus: ReinvestStatus;
  let completedAmount: Prisma.Decimal | null = null;

  switch (action) {
    case "CONFIRM_FULL":
      newStatus = "COMPLETED";
      completedAmount = signal.amount;
      break;
    case "CONFIRM_PARTIAL":
      if (!partialAmount || partialAmount <= 0) {
        throw new Error("Partial amount required for CONFIRM_PARTIAL");
      }
      newStatus = "PARTIAL_COMPLETED";
      completedAmount = new Prisma.Decimal(partialAmount);
      break;
    case "SNOOZE":
      newStatus = "SNOOZED";
      break;
    case "SKIP":
      newStatus = "SKIPPED";
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }

  return prisma.reinvestSignal.update({
    where: { id: signalId },
    data: {
      status: newStatus,
      completedAmount,
      completedAt: newStatus === "COMPLETED" || newStatus === "PARTIAL_COMPLETED" ? new Date() : null,
      acknowledgedAt: new Date(),
      notes,
    },
  });
}

/**
 * Get pending reinvest signals for an account.
 */
export async function getPendingSignals(accountId: string) {
  return prisma.reinvestSignal.findMany({
    where: {
      accountId,
      status: { in: ["CREATED", "NOTIFIED", "SNOOZED"] },
    },
    include: {
      underlying: true,
      instance: true,
    },
    orderBy: { dueAt: "asc" },
  });
}

/**
 * Get total reinvest-ready amount for an account.
 */
export async function getReinvestReadyAmount(accountId: string): Promise<Prisma.Decimal> {
  const signals = await prisma.reinvestSignal.findMany({
    where: {
      accountId,
      status: { in: ["CREATED", "NOTIFIED"] },
      dueAt: { lte: new Date() },
    },
    select: { amount: true },
  });

  return signals.reduce((sum, s) => sum.plus(s.amount), new Prisma.Decimal(0));
}
