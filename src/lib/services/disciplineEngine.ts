import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type EnvironmentSnapshot = {
  marketEnvironmentAtEntry: string | null;
  environmentScoreAtEntry: number | null;
  humanAIAlignmentAtEntry: Prisma.Decimal | null;
  routineCompletedAtEntry: boolean;
};

/**
 * Resolve market environment for a trade at entry date and return fields to attach to JournalTrade.
 * Call this when creating or updating a journal trade (entry date = date of trade).
 */
export async function getEnvironmentSnapshotForTrade(
  accountId: string,
  entryDateTime: Date | string | null
): Promise<EnvironmentSnapshot> {
  const empty: EnvironmentSnapshot = {
    marketEnvironmentAtEntry: null,
    environmentScoreAtEntry: null,
    humanAIAlignmentAtEntry: null,
    routineCompletedAtEntry: false,
  };

  if (!entryDateTime) return empty;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { userId: true },
  });
  if (!account) return empty;

  const date = typeof entryDateTime === "string" ? new Date(entryDateTime) : entryDateTime;
  const dateStr = date.toISOString().slice(0, 10);
  const startOfDay = new Date(dateStr + "T00:00:00.000Z");

  const [routine, environment] = await Promise.all([
    prisma.marketRoutineEntry.findUnique({
      where: { userId_date: { userId: account.userId, date: startOfDay } },
    }),
    prisma.marketEnvironment.findUnique({
      where: { userId_date: { userId: account.userId, date: startOfDay } },
    }),
  ]);

  if (!routine?.routineCompleted || !environment) {
    return empty;
  }

  return {
    marketEnvironmentAtEntry: environment.environmentLabel,
    environmentScoreAtEntry: environment.environmentScore,
    humanAIAlignmentAtEntry: environment.alignmentScore,
    routineCompletedAtEntry: true,
  };
}
