import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { createAccountSchema } from "@/lib/validations";

export async function GET() {
  try {
    const userId = await requireAuth();

    const accounts = await prisma.account.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            strategyInstances: true,
            reinvestSignals: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json();
    const data = createAccountSchema.parse(body);

    const account = await prisma.account.create({
      data: {
        ...data,
        userId,
      },
    });

    // Create default wheel targets
    const defaultTargets = [
      { category: "CORE" as const, targetPct: 40 },
      { category: "MAD_MONEY" as const, targetPct: 30 },
      { category: "FREE_CAPITAL" as const, targetPct: 20 },
      { category: "RISK_MGMT" as const, targetPct: 10 },
    ];

    await prisma.wealthWheelTarget.createMany({
      data: defaultTargets.map((t) => ({
        accountId: account.id,
        category: t.category,
        targetPct: t.targetPct,
      })),
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
