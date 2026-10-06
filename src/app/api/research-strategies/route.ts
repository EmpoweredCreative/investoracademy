import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { strategyInputSchema } from "@/lib/research/strategies";
import { listStrategies, serializeStrategy, strategyData } from "@/lib/research/strategyStore";

const MAX_STRATEGIES = 20;

/** GET — the user's research strategies (custom lenses). */
export async function GET() {
  try {
    const userId = await requireAuth();
    return NextResponse.json({ strategies: await listStrategies(userId) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — create a strategy. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const input = strategyInputSchema.parse(await req.json());
    if ((await prisma.researchStrategy.count({ where: { userId } })) >= MAX_STRATEGIES) {
      return NextResponse.json({ error: `You can save up to ${MAX_STRATEGIES} strategies.` }, { status: 400 });
    }
    const s = await prisma.researchStrategy.create({ data: { userId, ...strategyData(input) } });
    return NextResponse.json({ strategy: serializeStrategy(s) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
