import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { getCoreSummary } from "@/lib/services/coreBucket";

/**
 * GET /api/accounts/:id/core
 * Core holdings with plan, premium bucket balance and share growth.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const holdings = await getCoreSummary(accountId);
    return NextResponse.json({ holdings });
  } catch (error) {
    return handleApiError(error);
  }
}
