import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { syncSchwabAccount } from "@/lib/schwab/sync";
import { handleSchwabError } from "@/lib/schwab/errors";

export const maxDuration = 300;

/**
 * POST /api/accounts/:id/sync[?full=1]
 * Pull balances, positions and transactions from Schwab for a linked account.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    if (!account.brokerAccountHash) {
      return NextResponse.json({ error: "This account is not linked to Schwab." }, { status: 400 });
    }

    const result = await syncSchwabAccount(accountId, { full: req.nextUrl.searchParams.get("full") === "1" });
    return NextResponse.json(result);
  } catch (error) {
    return handleSchwabError(error);
  }
}
