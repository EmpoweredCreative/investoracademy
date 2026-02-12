import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { researchIdeaSchema } from "@/lib/validations";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const strategyType = searchParams.get("strategyType");

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const ideas = await prisma.researchIdea.findMany({
      where: {
        accountId,
        ...(strategyType ? { strategyType: strategyType as never } : {}),
      },
      include: {
        underlying: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(ideas);
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
    const data = researchIdeaSchema.parse(body);

    // Resolve underlyingId: accept either an ID or a symbol string
    let underlyingId = data.underlyingId;
    if (!underlyingId && data.symbol) {
      const symbol = data.symbol.toUpperCase().trim();
      // Find or create the underlying for this account
      let underlying = await prisma.underlying.findFirst({
        where: { accountId, symbol },
      });
      if (!underlying) {
        underlying = await prisma.underlying.create({
          data: { accountId, symbol },
        });
      }
      underlyingId = underlying.id;
    }
    if (!underlyingId) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const idea = await prisma.researchIdea.create({
      data: {
        accountId,
        underlyingId,
        strategyType: data.strategyType,
        dte: data.dte,
        atr: data.atr,
        strikes: data.strikes,
        deltas: data.deltas,
        netCredit: data.netCredit,
        bpe: data.bpe,
        netDelta: data.netDelta,
        roi: data.roi,
        roid: data.roid,
        notes: data.notes,
        wheelCategoryOverride: data.wheelCategoryOverride,
        price: data.price,
        month: data.month,
        shortStrike: data.shortStrike,
        shortDelta: data.shortDelta,
        longStrike: data.longStrike,
        shortCallStrike: data.shortCallStrike,
        shortCallDelta: data.shortCallDelta,
        longCallStrike: data.longCallStrike,
        shortPutStrike: data.shortPutStrike,
        shortPutDelta: data.shortPutDelta,
        longPutStrike: data.longPutStrike,
        earningsDate: data.earningsDate,
        expectedGap: data.expectedGap,
        expiration: data.expiration,
        spreadSubType: data.spreadSubType,
        longStrikeExp: data.longStrikeExp,
        longStrikeDebit: data.longStrikeDebit,
        shortStrikeExp: data.shortStrikeExp,
        shortStrikeCredit: data.shortStrikeCredit,
      },
    });

    return NextResponse.json(idea, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const ideaId = searchParams.get("ideaId");

    if (!ideaId) {
      return NextResponse.json({ error: "ideaId is required" }, { status: 400 });
    }

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await prisma.researchIdea.delete({
      where: { id: ideaId, accountId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
