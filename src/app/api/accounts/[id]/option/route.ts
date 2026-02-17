import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { optionEntrySchema } from "@/lib/validations";
import { processOptionEntry } from "@/lib/services/manualEntry";

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
    const data = optionEntrySchema.parse(body);

    const feesAmount = typeof data.fees === "number" && !Number.isNaN(data.fees) ? data.fees : 0;

    const result = await processOptionEntry({
      accountId,
      symbol: data.symbol,
      action: data.action,
      callPut: data.callPut,
      strike: data.strike,
      expiration: new Date(data.expiration),
      quantity: data.quantity,
      price: data.price,
      entryDelta: data.entryDelta,
      fees: feesAmount,
      occurredAt: new Date(data.occurredAt),
      strategyType: data.strategyType,
      premiumPolicyOverride: data.premiumPolicyOverride,
      wheelCategoryOverride: data.wheelCategoryOverride,
      notes: data.notes,
      additionalLegs: data.additionalLegs,
      exitPrice: data.exitPrice,
      exitDateTime: data.exitDateTime ? new Date(data.exitDateTime) : undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
