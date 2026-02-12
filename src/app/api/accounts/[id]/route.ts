import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { updateAccountSchema } from "@/lib/validations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;

    const account = await prisma.account.findFirst({
      where: { id, userId },
      include: {
        underlyings: true,
        wheelTargets: true,
        wheelClassifications: { include: { underlying: true } },
        _count: {
          select: {
            strategyInstances: true,
            ledgerEntries: true,
            reinvestSignals: true,
            journalTrades: true,
            researchIdeas: true,
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json(account);
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
    const { id } = await params;
    const body = await req.json();
    const data = updateAccountSchema.parse(body);

    const account = await prisma.account.findFirst({ where: { id, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Build update payload, converting types as needed for Prisma
    const updateData: Record<string, unknown> = { ...data };

    // Explicitly preserve null for defaultPolicy (clear account strategy)
    if ("defaultPolicy" in data) {
      updateData.defaultPolicy = data.defaultPolicy ?? null;
    }

    if (data.onboardingCompletedAt !== undefined) {
      updateData.onboardingCompletedAt = data.onboardingCompletedAt
        ? new Date(data.onboardingCompletedAt)
        : null;
    }

    const updated = await prisma.account.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;

    const account = await prisma.account.findFirst({ where: { id, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (account.archivedAt) {
      return NextResponse.json({ error: "Account is already archived" }, { status: 400 });
    }

    // Soft-delete: set archivedAt instead of permanently deleting
    const archived = await prisma.account.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    return NextResponse.json({ success: true, archivedAt: archived.archivedAt });
  } catch (error) {
    return handleApiError(error);
  }
}
