import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { computeAlignmentMetrics } from "@/lib/services/alignmentAnalytics";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const toDate = toStr ? new Date(toStr) : new Date();
    const fromDate = fromStr ? new Date(fromStr) : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);

    const metrics = await computeAlignmentMetrics(userId, fromDate, toDate);
    return NextResponse.json(metrics);
  } catch (error) {
    return handleApiError(error);
  }
}
