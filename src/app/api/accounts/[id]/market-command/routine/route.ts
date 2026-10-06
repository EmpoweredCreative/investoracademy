import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { MarketBias } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { marketRoutineEntrySchema } from "@/lib/validations";
import { upsertMarketEnvironment } from "@/lib/services/marketEnvironmentService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "Query param date (YYYY-MM-DD) required" }, { status: 400 });
    }

    const date = new Date(dateStr + "T00:00:00.000Z");
    const routine = await prisma.marketRoutineEntry.findUnique({
      where: { userId_date: { userId, date } },
      include: { symbolBiases: true },
    });

    const [environment, aiInsights] = await Promise.all([
      prisma.marketEnvironment.findUnique({
        where: { userId_date: { userId, date } },
      }),
      prisma.aIChartInsight.findMany({
        where: { userId, date },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      routine: routine
        ? {
            ...routine,
            date: routine.date.toISOString().slice(0, 10),
            symbolBiases: routine.symbolBiases.map((s) => ({
              ...s,
              dailyVolume: s.dailyVolume != null ? Number(s.dailyVolume) : null,
            })),
          }
        : null,
      environment: environment
        ? {
            ...environment,
            date: environment.date.toISOString().slice(0, 10),
            alignmentScore: environment.alignmentScore != null ? Number(environment.alignmentScore) : null,
          }
        : null,
      aiInsights: aiInsights.map((a) => ({
        ...a,
        date: a.date.toISOString().slice(0, 10),
      })),
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

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = await req.json();
    const data = marketRoutineEntrySchema.parse(body);
    const date = new Date(data.date + "T00:00:00.000Z");

    const routine = await prisma.$transaction(async (tx) => {
      const entry = await tx.marketRoutineEntry.upsert({
        where: { userId_date: { userId, date } },
        create: {
          userId,
          date,
          humanMarketBias: data.humanMarketBias ?? undefined,
          shortTermTrend: data.shortTermTrend ?? undefined,
          intermediateTrend: data.intermediateTrend ?? undefined,
          longTermTrend: data.longTermTrend ?? undefined,
          volatilityCondition: data.volatilityCondition ?? undefined,
          breadthCondition: data.breadthCondition ?? undefined,
          narrativeTags: data.narrativeTags ?? [],
          notes: data.notes ?? null,
          routineCompleted: data.routineCompleted ?? false,
        },
        update: {
          humanMarketBias: data.humanMarketBias ?? undefined,
          shortTermTrend: data.shortTermTrend ?? undefined,
          intermediateTrend: data.intermediateTrend ?? undefined,
          longTermTrend: data.longTermTrend ?? undefined,
          volatilityCondition: data.volatilityCondition ?? undefined,
          breadthCondition: data.breadthCondition ?? undefined,
          narrativeTags: data.narrativeTags ?? [],
          notes: data.notes ?? null,
          routineCompleted: data.routineCompleted ?? false,
        },
      });
      if (data.symbolBiases && data.symbolBiases.length > 0) {
        await tx.marketRoutineSymbolBias.deleteMany({
          where: { marketRoutineEntryId: entry.id },
        });
        const toCreate = data.symbolBiases
          .filter((s: { symbol: string; bias?: string | null; dailyVolume?: number | null }) => {
            if (!s.symbol?.trim()) return false;
            return s.bias != null || (s.dailyVolume != null && !Number.isNaN(s.dailyVolume));
          })
          .map((s: { symbol: string; category: string; bias?: string | null; dailyVolume?: number | null }) => ({
            marketRoutineEntryId: entry.id,
            symbol: s.symbol.toUpperCase().trim(),
            category: s.category,
            bias: (s.bias && ["BULLISH", "BEARISH", "NEUTRAL"].includes(s.bias) ? s.bias : undefined) as MarketBias | undefined,
            dailyVolume: s.dailyVolume != null && !Number.isNaN(s.dailyVolume) ? new Prisma.Decimal(s.dailyVolume) : undefined,
          }));
        if (toCreate.length > 0) {
          await tx.marketRoutineSymbolBias.createMany({ data: toCreate });
        }
      }
      await upsertMarketEnvironment(userId, data.date, tx);
      return entry;
    });

    return NextResponse.json({
      ...routine,
      date: routine.date.toISOString().slice(0, 10),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = await req.json();
    const data = marketRoutineEntrySchema.partial().parse(body);
    const patchDate = data.date;
    if (!patchDate) {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    const date = new Date(patchDate + "T00:00:00.000Z");

    const routine = await prisma.$transaction(async (tx) => {
      const entry = await tx.marketRoutineEntry.update({
        where: { userId_date: { userId, date } },
        data: {
          ...(data.humanMarketBias !== undefined && { humanMarketBias: data.humanMarketBias }),
          ...(data.shortTermTrend !== undefined && { shortTermTrend: data.shortTermTrend }),
          ...(data.intermediateTrend !== undefined && { intermediateTrend: data.intermediateTrend }),
          ...(data.longTermTrend !== undefined && { longTermTrend: data.longTermTrend }),
          ...(data.volatilityCondition !== undefined && { volatilityCondition: data.volatilityCondition }),
          ...(data.breadthCondition !== undefined && { breadthCondition: data.breadthCondition }),
          ...(data.narrativeTags !== undefined && { narrativeTags: data.narrativeTags }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.routineCompleted !== undefined && { routineCompleted: data.routineCompleted }),
        },
      });
      await upsertMarketEnvironment(userId, patchDate, tx);
      return entry;
    });

    return NextResponse.json({
      ...routine,
      date: routine.date.toISOString().slice(0, 10),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
