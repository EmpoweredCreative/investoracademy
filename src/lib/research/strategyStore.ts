import { Prisma, type ResearchStrategy } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeProfile } from "@/lib/fundamentals/criteria";
import { normalizeFilters } from "@/lib/finviz/filters";
import type { StrategyInput } from "./strategies";

export const serializeStrategy = (s: ResearchStrategy) => ({
  id: s.id,
  name: s.name,
  baseLens: s.baseLens,
  finvizFilters: normalizeFilters((s.finvizFilters as string[]) ?? []),
  criteria: normalizeProfile(s.criteria),
  questions: (s.questions as string[]) ?? [],
  updatedAt: s.updatedAt.toISOString(),
});

/**
 * The user's strategies. The first time, their existing research criteria become
 * "My strategy" so nothing they set up before is lost.
 */
export async function listStrategies(userId: string) {
  let rows = await prisma.researchStrategy.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  if (rows.length === 0) {
    const legacy = await prisma.researchCriteriaProfile.findUnique({ where: { userId } });
    if (legacy) {
      await prisma.researchStrategy.create({
        data: {
          userId,
          name: "My strategy",
          finvizFilters: [],
          criteria: normalizeProfile(legacy.profile) as unknown as Prisma.InputJsonValue,
          questions: [],
        },
      });
      rows = await prisma.researchStrategy.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    }
  }
  return rows.map(serializeStrategy);
}

export const strategyData = (input: StrategyInput) => ({
  name: input.name,
  baseLens: input.baseLens ?? null,
  finvizFilters: normalizeFilters(input.finvizFilters),
  criteria: input.criteria as unknown as Prisma.InputJsonValue,
  questions: input.questions,
});
