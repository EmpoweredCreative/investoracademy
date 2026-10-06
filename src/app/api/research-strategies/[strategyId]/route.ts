import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { strategyInputSchema } from "@/lib/research/strategies";
import { serializeStrategy, strategyData } from "@/lib/research/strategyStore";

type Params = { params: Promise<{ strategyId: string }> };

async function owned(params: Params["params"]) {
  const userId = await requireAuth();
  const { strategyId } = await params;
  const s = await prisma.researchStrategy.findFirst({ where: { id: strategyId, userId } });
  if (!s) throw new Error("NOT_FOUND");
  return s;
}

/** PUT — replace a strategy's name, filters, criteria and questions. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const s = await owned(params);
    const input = strategyInputSchema.parse(await req.json());
    const updated = await prisma.researchStrategy.update({ where: { id: s.id }, data: strategyData(input) });
    return NextResponse.json({ strategy: serializeStrategy(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const s = await owned(params);
    await prisma.researchStrategy.delete({ where: { id: s.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
