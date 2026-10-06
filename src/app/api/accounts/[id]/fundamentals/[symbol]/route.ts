import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser, normalizeSymbol } from "@/lib/fundamentals/accountAccess";
import { evaluateSnapshot, fxForSnapshot, getUserCriteria, latestMarginOfSafety } from "@/lib/fundamentals/research";
import { fundamentalResearchPatchSchema } from "@/lib/validations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; symbol: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId, symbol: rawSymbol } = await params;
    await requireAccountForUser(accountId, userId);
    const symbol = normalizeSymbol(decodeURIComponent(rawSymbol));

    const [watchlistItem, snapshot, research, thread] = await Promise.all([
      prisma.fundamentalWatchlistItem.findUnique({
        where: { accountId_symbol: { accountId, symbol } },
      }),
      prisma.fundamentalSnapshot.findUnique({
        where: { accountId_symbol: { accountId, symbol } },
      }),
      prisma.fundamentalResearch.findUnique({
        where: { accountId_symbol: { accountId, symbol } },
      }),
      prisma.fundamentalChatThread.findUnique({
        where: { accountId_symbol: { accountId, symbol } },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
      }),
    ]);

    if (!watchlistItem && !snapshot) {
      throw new Error("NOT_FOUND");
    }

    const [profile, marginOfSafety, fx] = await Promise.all([
      getUserCriteria(userId),
      latestMarginOfSafety(accountId, symbol),
      fxForSnapshot(snapshot),
    ]);
    const { evaluation, ratios, ryg } = evaluateSnapshot(snapshot, profile, marginOfSafety, fx);

    return NextResponse.json({
      symbol,
      watchlistItem,
      snapshot: snapshot
        ? {
            ...snapshot,
            fetchedAt: snapshot.fetchedAt.toISOString(),
            nextEarningsDate: snapshot.nextEarningsDate?.toISOString().slice(0, 10) ?? null,
            price: snapshot.price ? parseFloat(snapshot.price.toString()) : null,
          }
        : null,
      ratios,
      ryg,
      evaluation: { score: evaluation.score, passScore: evaluation.passScore, verdict: evaluation.verdict, failedRequired: evaluation.failedRequired },
      research,
      thread: thread
        ? {
            id: thread.id,
            messages: thread.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.createdAt.toISOString(),
            })),
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; symbol: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId, symbol: rawSymbol } = await params;
    await requireAccountForUser(accountId, userId);
    const symbol = normalizeSymbol(decodeURIComponent(rawSymbol));

    const body = await req.json();
    const data = fundamentalResearchPatchSchema.parse(body);

    const update: Record<string, unknown> = {};
    if (data.verdict !== undefined) update.verdict = data.verdict;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.earningsNotes !== undefined) update.earningsNotes = data.earningsNotes;
    if (data.earningsReviewed === true) update.earningsReviewedAt = new Date();
    if (data.earningsReviewed === false) update.earningsReviewedAt = null;
    for (const key of [
      "mgmtCapitalAllocation",
      "mgmtIncentives",
      "mgmtExecution",
      "brandPricingPower",
      "brandLoyalty",
      "brandTrust",
    ] as const) {
      if (data[key] !== undefined) update[key] = data[key];
    }

    const research = await prisma.fundamentalResearch.upsert({
      where: { accountId_symbol: { accountId, symbol } },
      create: {
        accountId,
        symbol,
        ...update,
      },
      update,
    });

    return NextResponse.json(research);
  } catch (error) {
    return handleApiError(error);
  }
}
