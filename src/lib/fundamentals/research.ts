import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { statementFx } from "@/lib/marketdata/fx";
import {
  DEFAULT_PROFILE,
  evaluateCriteria,
  metricValuesFromSnapshot,
  normalizeProfile,
  type CriteriaEvaluation,
  type CriteriaProfile,
} from "./criteria";

export async function getUserCriteria(userId: string): Promise<CriteriaProfile> {
  const row = await prisma.researchCriteriaProfile.findUnique({ where: { userId } });
  return row ? normalizeProfile(row.profile) : DEFAULT_PROFILE;
}

export async function saveUserCriteria(userId: string, profile: CriteriaProfile) {
  const data = { profile: profile as unknown as Prisma.InputJsonValue };
  await prisma.researchCriteriaProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

/** Margin of safety from the most recent saved DCF for this symbol, if any. */
export async function latestMarginOfSafety(accountId: string, symbol: string): Promise<number | null> {
  const model = await prisma.dcfModel.findFirst({
    where: { accountId, symbol },
    orderBy: { createdAt: "desc" },
    select: { outputs: true },
  });
  const mos = (model?.outputs as { marginOfSafety?: number | null } | undefined)?.marginOfSafety;
  return typeof mos === "number" ? mos : null;
}

type SnapshotInput = Parameters<typeof metricValuesFromSnapshot>[0];

/** Legacy row shape the existing pages render (dot · metric · value · assessment). */
export function toRatioRows(evaluation: CriteriaEvaluation) {
  return evaluation.rows.map((r) => ({
    key: r.key,
    name: r.name,
    value: r.value,
    formattedValue: r.formatted,
    required: r.required,
    score: { status: r.status, label: r.rule, warning: r.warning },
  }));
}

/** Statement→price FX for a snapshot (1 for same-currency filers). */
export async function fxForSnapshot(snapshot: { raw?: unknown } | null) {
  return snapshot ? statementFx(snapshot.raw) : 1;
}

export function evaluateSnapshot(
  snapshot: SnapshotInput | null,
  profile: CriteriaProfile,
  marginOfSafety: number | null = null,
  fx: number | null = 1
) {
  const evaluation = evaluateCriteria(snapshot ? metricValuesFromSnapshot(snapshot, { marginOfSafety, fx }) : {}, profile);
  return { evaluation, ratios: toRatioRows(evaluation), ryg: evaluation.counts };
}
