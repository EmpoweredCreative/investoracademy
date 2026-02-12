import { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

/**
 * Adjust the account's cash balance by the given amount.
 *
 * - Positive amount → cash increases (e.g. premium received, stock sale, deposit)
 * - Negative amount → cash decreases (e.g. premium paid, stock purchase)
 *
 * Only applies when onboarding is complete. During onboarding the user is
 * entering historical data, so cash changes are not tracked automatically.
 */
export async function adjustCashBalance(
  tx: TransactionClient,
  accountId: string,
  amount: Prisma.Decimal
) {
  const account = await tx.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { onboardingCompletedAt: true },
  });

  // Still onboarding — skip automatic cash tracking
  if (!account.onboardingCompletedAt) return;

  await tx.account.update({
    where: { id: accountId },
    data: { cashBalance: { increment: amount } },
  });
}
