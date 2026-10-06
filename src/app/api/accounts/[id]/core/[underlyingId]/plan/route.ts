import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { corePlanSchema } from "@/lib/validations";

/**
 * PUT /api/accounts/:id/core/:underlyingId/plan
 * Set what happens to this core holding's premium going forward.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; underlyingId: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId, underlyingId } = await params;

    const underlying = await prisma.underlying.findFirst({
      where: { id: underlyingId, accountId, account: { userId } },
    });
    if (!underlying) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    const data = corePlanSchema.parse(await req.json());
    const plan = await prisma.corePlan.upsert({
      where: { underlyingId },
      create: { underlyingId, ...data, shareGoal: data.shareGoal ?? null },
      update: { ...data, shareGoal: data.shareGoal ?? null },
    });

    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error);
  }
}
