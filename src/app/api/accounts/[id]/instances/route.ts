import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const instances = await prisma.strategyInstance.findMany({
      where: {
        accountId,
        ...(status ? { status: status as "OPEN" | "FINALIZED" } : {}),
      },
      include: {
        underlying: true,
        ledgerEntries: true,
        reinvestSignal: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(instances);
  } catch (error) {
    return handleApiError(error);
  }
}
