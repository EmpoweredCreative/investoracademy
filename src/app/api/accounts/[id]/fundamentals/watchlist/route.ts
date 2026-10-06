import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser, normalizeSymbol } from "@/lib/fundamentals/accountAccess";
import { buildWatchlistEntry } from "@/lib/fundamentals/watchlistResponse";
import { fundamentalWatchlistPostSchema } from "@/lib/validations";
import { refreshFundamentalsBatch } from "@/lib/fundamentals/yahooFundamentals";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    await requireAccountForUser(accountId, userId);

    const items = await prisma.fundamentalWatchlistItem.findMany({
      where: { accountId },
      orderBy: { symbol: "asc" },
    });

    const symbols = items.map((i) => i.symbol);
    const snapshots = await prisma.fundamentalSnapshot.findMany({
      where: { accountId, symbol: { in: symbols } },
    });
    const snapBySymbol = new Map(snapshots.map((s) => [s.symbol, s]));

    return NextResponse.json({
      items: items.map((item) =>
        buildWatchlistEntry(item, snapBySymbol.get(item.symbol) ?? null)
      ),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    await requireAccountForUser(accountId, userId);

    const body = await req.json();
    const { symbol: raw } = fundamentalWatchlistPostSchema.parse(body);
    const symbol = normalizeSymbol(raw);

    const existing = await prisma.fundamentalWatchlistItem.findUnique({
      where: { accountId_symbol: { accountId, symbol } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Symbol already on watchlist", item: existing },
        { status: 409 }
      );
    }

    const item = await prisma.fundamentalWatchlistItem.create({
      data: {
        accountId,
        symbol,
        source: "MANUAL",
        yahooFetchStatus: "PENDING",
      },
    });

    void refreshFundamentalsBatch(accountId, [symbol]).catch((err) =>
      console.error("[fundamentals] manual symbol fetch failed", err)
    );

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
