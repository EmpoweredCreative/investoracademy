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

    const result = await processOptionEntry({
      accountId,
      symbol: data.symbol,
      action: data.action,
      callPut: data.callPut,
      strike: data.strike,
      expiration: new Date(data.expiration),
      quantity: data.quantity,
      price: data.price,
      fees: data.fees,
      occurredAt: new Date(data.occurredAt),
      premiumPolicyOverride: data.premiumPolicyOverride,
      wheelCategoryOverride: data.wheelCategoryOverride,
      notes: data.notes,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
