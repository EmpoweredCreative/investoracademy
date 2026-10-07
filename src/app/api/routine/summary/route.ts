import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";

/** Watchlist and journal snapshot for routine steps 4 and 5. */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const accountId = req.nextUrl.searchParams.get("accountId");
    if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

    const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [watchItems, scores, openTrades, closedThisWeek, missingNotes, recent] = await Promise.all([
      prisma.fundamentalWatchlistItem.findMany({
        where: { accountId, status: { not: "REJECTED" } },
        select: { symbol: true, status: true },
      }),
      prisma.companyScore.findMany({ where: { accountId }, select: { symbol: true, score: true } }),
      prisma.journalTrade.count({ where: { accountId, exitDateTime: null } }),
      prisma.journalTrade.count({ where: { accountId, exitDateTime: { gte: weekAgo } } }),
      prisma.journalTrade.count({
        where: { accountId, OR: [{ thesisNotes: null }, { thesisNotes: "" }], createdAt: { gte: weekAgo } },
      }),
      prisma.journalTrade.findMany({
        where: { accountId },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: {
          id: true,
          callPut: true,
          strike: true,
          exitDateTime: true,
          updatedAt: true,
          underlying: { select: { symbol: true } },
        },
      }),
    ]);

    const best = new Map<string, number>();
    for (const s of scores) {
      if (s.score != null) best.set(s.symbol, Math.max(best.get(s.symbol) ?? 0, s.score));
    }
    const watchlist = watchItems
      .map((w) => ({ symbol: w.symbol, status: w.status, score: best.get(w.symbol) ?? null }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.symbol.localeCompare(b.symbol));

    return NextResponse.json({
      watchlist: { total: watchlist.length, top: watchlist.slice(0, 6) },
      journal: {
        openTrades,
        closedThisWeek,
        missingNotes,
        recent: recent.map((t) => ({
          id: t.id,
          symbol: t.underlying.symbol,
          callPut: t.callPut,
          strike: t.strike != null ? Number(t.strike) : null,
          closed: t.exitDateTime != null,
          updatedAt: t.updatedAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
