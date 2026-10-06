import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser } from "@/lib/fundamentals/accountAccess";
import { FinvizError, runScreen, SORTS, type ScreenSort } from "@/lib/finviz/client";
import { getFinvizStatus, getFinvizToken } from "@/lib/finviz/credentials";
import { criteriaProfileSchema } from "@/lib/fundamentals/criteria";
import { getUserCriteria } from "@/lib/fundamentals/research";
import { quickScoreFromScreen } from "@/lib/research/scoreService";
import { weightsForLens } from "@/lib/research/score";

const MAX_ROWS = 200;

const bodySchema = z.object({
  filters: z.array(z.string().regex(/^[a-z0-9_.]+$/i).max(40)).max(40),
  sort: z.enum(Object.keys(SORTS) as [ScreenSort, ...ScreenSort[]]).optional(),
  /** The strategy's scoring thresholds and base lens, for each row's quick WealthOS Score. */
  criteria: criteriaProfileSchema.optional(),
  baseLens: z.string().max(40).nullish(),
});

/** GET — whether this user has connected Finviz Elite. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    await requireAccountForUser(accountId, userId);
    return NextResponse.json({ ...(await getFinvizStatus(userId)), sorts: SORTS });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST { filters, sort } — run a screen on Finviz Elite; marks rows already on the watchlist. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    await requireAccountForUser(accountId, userId);
    const { filters, sort, criteria, baseLens } = bodySchema.parse(await req.json());
    const profile = criteria ?? (await getUserCriteria(userId));
    const weights = weightsForLens(baseLens ?? "none");
    const { rows, cached } = await runScreen(await getFinvizToken(userId), filters, sort);
    const shown = rows.slice(0, MAX_ROWS);
    const listed = await prisma.fundamentalWatchlistItem.findMany({
      where: { accountId, symbol: { in: shown.map((r) => r.symbol) } },
      select: { symbol: true },
    });
    const onWatchlist = new Set(listed.map((l) => l.symbol));
    return NextResponse.json({
      total: rows.length,
      cached,
      rows: shown.map((r) => {
        const q = quickScoreFromScreen(r, profile, weights);
        return { ...r, onWatchlist: onWatchlist.has(r.symbol), quickScore: q.score, scoreCaps: q.caps };
      }),
    });
  } catch (error) {
    if (error instanceof FinvizError) return NextResponse.json({ error: error.message }, { status: 502 });
    return handleApiError(error);
  }
}
