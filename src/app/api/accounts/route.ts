import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { createAccountSchema } from "@/lib/validations";
import { DEFAULT_BUCKET_TARGETS } from "@/lib/buckets";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const showArchived = req.nextUrl.searchParams.get("archived") === "true";

    const accounts = await prisma.account.findMany({
      where: {
        userId,
        archivedAt: showArchived ? { not: null } : null,
      },
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
    await prisma.wealthWheelTarget.createMany({
      data: DEFAULT_BUCKET_TARGETS.map((t) => ({
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
