import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser } from "@/lib/fundamentals/accountAccess";
import { computeCompanyScore } from "@/lib/research/scoreService";

// Full scores pull ~10 years of SEC data per stock.
export const maxDuration = 300;
const BUDGET_MS = 270_000;

/** POST ?lens= — calculate full WealthOS Scores for every loaded watchlist stock (stops before the time limit). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    await requireAccountForUser(accountId, userId);
    const lensKey = req.nextUrl.searchParams.get("lens");

    const items = await prisma.fundamentalWatchlistItem.findMany({
      where: { accountId, yahooFetchStatus: "READY" },
      select: { symbol: true },
      orderBy: { symbol: "asc" },
    });
    const started = Date.now();
    let scored = 0;
    const failed: string[] = [];
    for (const { symbol } of items) {
      if (Date.now() - started > BUDGET_MS) break;
      try {
        await computeCompanyScore({ userId, accountId, symbol, lensKey });
        scored++;
      } catch {
        failed.push(symbol);
      }
    }
    return NextResponse.json({ scored, failed, remaining: items.length - scored - failed.length });
  } catch (error) {
    return handleApiError(error);
  }
}
