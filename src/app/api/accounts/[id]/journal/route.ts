import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { journalTradeSchema } from "@/lib/validations";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const trades = await prisma.journalTrade.findMany({
      where: {
        accountId,
        ...(category
          ? { wheelCategoryOverride: category as "CORE" | "MAD_MONEY" | "FREE_CAPITAL" | "RISK_MGMT" }
          : {}),
      },
      include: {
        underlying: true,
        strategyInstance: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(trades);
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
    const data = journalTradeSchema.parse(body);

    const trade = await prisma.journalTrade.create({
      data: {
        accountId,
        ...data,
        strike: data.strike ?? undefined,
        entryDateTime: data.entryDateTime ? new Date(data.entryDateTime) : undefined,
        exitDateTime: data.exitDateTime ? new Date(data.exitDateTime) : undefined,
      },
    });

    return NextResponse.json(trade, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
