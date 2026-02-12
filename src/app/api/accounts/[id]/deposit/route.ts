import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { depositSchema } from "@/lib/validations";
import { adjustCashBalance } from "@/lib/services/cashTracker";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = await req.json();
    const data = depositSchema.parse(body);
    const amount = new Prisma.Decimal(data.amount);

    const result = await prisma.$transaction(async (tx) => {
      // Create a CASH_DEPOSIT ledger entry for record keeping
      const entry = await tx.ledgerEntry.create({
        data: {
          accountId,
          type: "CASH_DEPOSIT",
          amount,
          occurredAt: new Date(data.occurredAt),
          description: data.notes || `Cash deposit of $${data.amount.toFixed(2)}`,
        },
      });

      // Adjust the account cash balance
      await adjustCashBalance(tx, accountId, amount);

      return entry;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
