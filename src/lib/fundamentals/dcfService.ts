import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runDcf, scenarios, sensitivityGrid, suggestAssumptions, type DcfAssumptions } from "./dcf";
import { getFinancialHistory } from "./history";

/** History, suggested assumptions, and saved models for the DCF tab and Claude. */
export async function getDcfContext(accountId: string, symbol: string) {
  const { history, price, currency, currencyNote } = await getFinancialHistory(accountId, symbol);
  const models = await prisma.dcfModel.findMany({
    where: { accountId, symbol },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return {
    history,
    price,
    currency,
    currencyNote,
    suggested: suggestAssumptions(history, price),
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      createdBy: m.createdBy,
      createdAt: m.createdAt.toISOString(),
      assumptions: m.assumptions as unknown as DcfAssumptions,
      outputs: m.outputs as unknown as SavedDcfOutputs,
    })),
  };
}

export interface SavedDcfOutputs {
  intrinsicPerShare: number;
  marginOfSafety: number | null;
  terminalShare: number;
  equityValue: number;
  scenarios: { bear: number | null; base: number | null; bull: number | null };
  warnings: string[];
}

export function computeDcf(assumptions: DcfAssumptions) {
  const result = runDcf(assumptions);
  return {
    result,
    grid: sensitivityGrid(assumptions),
    outputs: {
      intrinsicPerShare: result.intrinsicPerShare,
      marginOfSafety: result.marginOfSafety,
      terminalShare: result.terminalShare,
      equityValue: result.equityValue,
      scenarios: scenarios(assumptions),
      warnings: result.warnings,
    } satisfies SavedDcfOutputs,
  };
}

export async function saveDcfModel(
  accountId: string,
  symbol: string,
  assumptions: DcfAssumptions,
  opts: { name?: string | null; createdBy?: "user" | "claude" } = {}
) {
  const { outputs } = computeDcf(assumptions);
  return prisma.dcfModel.create({
    data: {
      accountId,
      symbol,
      name: opts.name ?? null,
      createdBy: opts.createdBy ?? "user",
      assumptions: assumptions as unknown as Prisma.InputJsonValue,
      outputs: outputs as unknown as Prisma.InputJsonValue,
    },
  });
}
