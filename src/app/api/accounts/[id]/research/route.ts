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

    const idea = await prisma.researchIdea.create({
      data: {
        accountId,
        ...data,
      },
    });

    return NextResponse.json(idea, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
