import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { wheelTargetSchema, wheelClassificationSchema } from "@/lib/validations";
import { calculateWheel } from "@/lib/services/wheelCalculator";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const wheel = await calculateWheel(accountId);

    return NextResponse.json({
      slices: wheel.slices.map((s) => ({
        category: s.category,
        currentValue: s.currentValue.toFixed(2),
        targetPct: s.targetPct.toFixed(2),
        actualPct: s.actualPct.toFixed(2),
        delta: s.delta.toFixed(2),
      })),
      totalValue: wheel.totalValue.toFixed(2),
      cashBalance: wheel.cashBalance.toFixed(2),
      cashflowReserve: wheel.cashflowReserve.toFixed(2),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
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
    const data = wheelTargetSchema.parse(body);

    // Upsert all targets
    for (const target of data.targets) {
      await prisma.wealthWheelTarget.upsert({
        where: {
          accountId_category: { accountId, category: target.category },
        },
        create: {
          accountId,
          category: target.category,
          targetPct: target.targetPct,
        },
        update: {
          targetPct: target.targetPct,
        },
      });
    }

    return NextResponse.json({ success: true });
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
    const data = wheelClassificationSchema.parse(body);

    const classification = await prisma.wealthWheelClassification.upsert({
      where: {
        accountId_underlyingId: {
          accountId,
          underlyingId: data.underlyingId,
        },
      },
      create: {
        accountId,
        underlyingId: data.underlyingId,
        category: data.category,
      },
      update: {
        category: data.category,
      },
    });

    return NextResponse.json(classification);
  } catch (error) {
    return handleApiError(error);
  }
}
