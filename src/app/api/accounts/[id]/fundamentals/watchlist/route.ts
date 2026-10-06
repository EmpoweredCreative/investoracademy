import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser, normalizeSymbol } from "@/lib/fundamentals/accountAccess";
import { buildWatchlistEntry } from "@/lib/fundamentals/watchlistResponse";
import { fxForSnapshot, getUserCriteria } from "@/lib/fundamentals/research";
import { fundamentalWatchlistPostSchema } from "@/lib/validations";
import { refreshFundamentalsBatch } from "@/lib/fundamentals/yahooFundamentals";
import { getBuiltinLens } from "@/lib/research/lenses";
import { quickScoreFromSnapshot } from "@/lib/research/scoreService";
import { weightsForLens } from "@/lib/research/score";

/** GET — watchlist scored by the user's criteria, or by an investor lens with ?lens=buffett|lynch|druckenmiller. */
export async function GET(
  req: NextRequest,
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
    const lens = getBuiltinLens(req.nextUrl.searchParams.get("lens"));
    const profile = lens ? lens.criteria : await getUserCriteria(userId);
    const fxBySymbol = new Map(
      await Promise.all(snapshots.map(async (s) => [s.symbol, await fxForSnapshot(s)] as const))
    );

    // WealthOS Score: the saved full score for this lens, else a quick one from live metrics.
    const lensKey = lens?.key ?? "none";
    const weights = weightsForLens(lensKey);
    const saved = new Map(
      (await prisma.companyScore.findMany({ where: { accountId, lensKey, symbol: { in: symbols } } })).map((r) => [r.symbol, r])
    );

    return NextResponse.json({
      items: items.map((item) => {
        const snap = snapBySymbol.get(item.symbol) ?? null;
        const fx = fxBySymbol.get(item.symbol) ?? 1;
        const full = saved.get(item.symbol);
        const quick = !full && snap ? quickScoreFromSnapshot(snap, profile, weights, fx) : null;
        return {
          ...buildWatchlistEntry(item, snap, profile, fx),
          wealthScore: full ? full.score : (quick?.score ?? null),
          scoreConfidence: full ? full.confidence : quick ? "LOW" : null,
          scoreQuick: !full,
        };
      }),
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
