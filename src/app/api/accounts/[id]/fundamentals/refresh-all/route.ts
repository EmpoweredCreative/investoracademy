import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser } from "@/lib/fundamentals/accountAccess";
import { refreshFundamentalsBatch } from "@/lib/fundamentals/yahooFundamentals";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    await requireAccountForUser(accountId, userId);

    const url = new URL(req.url);
    const onlyFailed = url.searchParams.get("onlyFailed") === "true";

    const items = await prisma.fundamentalWatchlistItem.findMany({
      where: {
        accountId,
        ...(onlyFailed
          ? { yahooFetchStatus: { in: ["PENDING", "ERROR"] } }
          : {}),
      },
      select: { symbol: true },
    });

    const symbols = items.map((i) => i.symbol);
    if (symbols.length === 0) {
      return NextResponse.json({ message: "Nothing to refresh", success: [], failed: [] });
    }

    await prisma.fundamentalWatchlistItem.updateMany({
      where: { accountId, symbol: { in: symbols } },
      data: { yahooFetchStatus: "PENDING", yahooFetchError: null },
    });

    void refreshFundamentalsBatch(accountId, symbols).catch((err) =>
      console.error("[fundamentals] refresh-all batch failed", err)
    );

    return NextResponse.json({
      message: `Refreshing ${symbols.length} symbol(s)`,
      count: symbols.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
