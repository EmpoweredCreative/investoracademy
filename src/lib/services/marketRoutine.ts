import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { breadthConditionEnum, marketBiasEnum, symbolBiasSchema, volatilityConditionEnum } from "@/lib/validations";
import { upsertMarketEnvironment } from "@/lib/services/marketEnvironmentService";
import { BLUEPRINT_INTERVAL_DAYS, ROUTINE_STEP_KEYS } from "@/lib/routineSteps";

/** Partial update to a day's routine. Only fields present are written. */
export const routinePatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stepsCompleted: z.array(z.enum(ROUTINE_STEP_KEYS as [string, ...string[]])).optional(),
  humanMarketBias: marketBiasEnum.nullable().optional(),
  shortTermTrend: marketBiasEnum.nullable().optional(),
  intermediateTrend: marketBiasEnum.nullable().optional(),
  longTermTrend: marketBiasEnum.nullable().optional(),
  volatilityCondition: volatilityConditionEnum.nullable().optional(),
  breadthCondition: breadthConditionEnum.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  /** Upserted per symbol; a null bias with no volume removes the row. */
  symbolBiases: z.array(symbolBiasSchema).optional(),
});

export type RoutinePatch = z.infer<typeof routinePatchSchema>;

const asDate = (s: string) => new Date(s + "T00:00:00.000Z");

export async function getRoutine(userId: string, dateStr: string) {
  const [entry, lastBlueprint] = await Promise.all([
    prisma.marketRoutineEntry.findUnique({
      where: { userId_date: { userId, date: asDate(dateStr) } },
      include: { symbolBiases: true },
    }),
    prisma.marketRoutineEntry.findFirst({
      where: { userId, stepsCompleted: { has: "blueprint" }, date: { lte: asDate(dateStr) } },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);
  return {
    routine: entry
      ? {
          ...entry,
          date: entry.date.toISOString().slice(0, 10),
          symbolBiases: entry.symbolBiases.map((s) => ({
            symbol: s.symbol,
            category: s.category,
            bias: s.bias,
            dailyVolume: s.dailyVolume != null ? Number(s.dailyVolume) : null,
          })),
        }
      : null,
    lastBlueprintReview: lastBlueprint?.date.toISOString().slice(0, 10) ?? null,
  };
}

export async function saveRoutine(userId: string, patch: RoutinePatch) {
  const date = asDate(patch.date);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { date: _date, symbolBiases, stepsCompleted, ...fields } = patch;
  const steps = stepsCompleted ? [...new Set(stepsCompleted)] : undefined;
  const data = {
    ...fields,
    ...(steps && { stepsCompleted: steps, routineCompleted: await isComplete(userId, patch.date, steps) }),
  };

  await prisma.$transaction(async (tx) => {
    const entry = await tx.marketRoutineEntry.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...data },
      update: data,
    });
    for (const s of symbolBiases ?? []) {
      const where = { marketRoutineEntryId_symbol: { marketRoutineEntryId: entry.id, symbol: s.symbol } };
      if (s.bias == null && s.dailyVolume == null) {
        await tx.marketRoutineSymbolBias.deleteMany({ where: { marketRoutineEntryId: entry.id, symbol: s.symbol } });
        continue;
      }
      const row = {
        category: s.category,
        bias: s.bias ?? null,
        dailyVolume: s.dailyVolume != null ? new Prisma.Decimal(Math.round(s.dailyVolume)) : null,
      };
      await tx.marketRoutineSymbolBias.upsert({
        where,
        create: { marketRoutineEntryId: entry.id, symbol: s.symbol, ...row },
        update: row,
      });
    }
    await upsertMarketEnvironment(userId, patch.date, tx);
  });

  return getRoutine(userId, patch.date);
}

/** Daily steps all done, and the weekly blueprint review done today or within the interval. */
async function isComplete(userId: string, dateStr: string, steps: string[]): Promise<boolean> {
  const daily = ROUTINE_STEP_KEYS.filter((k) => k !== "blueprint");
  if (!daily.every((k) => steps.includes(k))) return false;
  if (steps.includes("blueprint")) return true;
  const since = new Date(asDate(dateStr).getTime() - BLUEPRINT_INTERVAL_DAYS * 86_400_000);
  const recent = await prisma.marketRoutineEntry.findFirst({
    where: { userId, stepsCompleted: { has: "blueprint" }, date: { gt: since, lt: asDate(dateStr) } },
    select: { id: true },
  });
  return recent != null;
}
