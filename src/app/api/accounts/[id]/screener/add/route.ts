import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser, normalizeSymbol } from "@/lib/fundamentals/accountAccess";
import { refreshFundamentalsBatch } from "@/lib/fundamentals/yahooFundamentals";

export const maxDuration = 300;

const bodySchema = z.object({ symbols: z.array(z.string()).min(1).max(50), strategyName: z.string().max(60).optional() });

/** POST { symbols } — add screener results to the watchlist and fetch their fundamentals in the background. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    await requireAccountForUser(accountId, userId);
    const { symbols: raw, strategyName } = bodySchema.parse(await req.json());
    const symbols = [...new Set(raw.map(normalizeSymbol))];
    const existing = new Set(
      (await prisma.fundamentalWatchlistItem.findMany({ where: { accountId, symbol: { in: symbols } }, select: { symbol: true } })).map((e) => e.symbol)
    );
    const fresh = symbols.filter((s) => !existing.has(s));
    if (fresh.length) {
      await prisma.fundamentalWatchlistItem.createMany({
        data: fresh.map((symbol) => ({
          accountId,
          symbol,
          source: "MANUAL" as const,
          screenerNotes: strategyName ? `From screener: ${strategyName}` : "From screener",
          yahooFetchStatus: "PENDING" as const,
        })),
        skipDuplicates: true,
      });
      after(() => refreshFundamentalsBatch(accountId, fresh).catch((err) => console.error("[screener add]", err)));
    }
    return NextResponse.json({ added: fresh.length, alreadyListed: symbols.length - fresh.length });
  } catch (error) {
    return handleApiError(error);
  }
}
