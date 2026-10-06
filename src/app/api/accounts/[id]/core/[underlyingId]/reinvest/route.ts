import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { coreReinvestSchema } from "@/lib/validations";
import { processStockEntry } from "@/lib/services/manualEntry";

/**
 * POST /api/accounts/:id/core/:underlyingId/reinvest
 * Record a share purchase paid for from this holding's premium bucket.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; underlyingId: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId, underlyingId } = await params;

    const underlying = await prisma.underlying.findFirst({
      where: { id: underlyingId, accountId, account: { userId } },
    });
    if (!underlying) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    const data = coreReinvestSchema.parse(await req.json());
    const result = await processStockEntry({
      accountId,
      symbol: underlying.symbol,
      action: "BUY",
      quantity: data.shares,
      price: data.price,
      fees: data.fees,
      occurredAt: new Date(data.occurredAt),
      wheelCategory: "CORE",
      notes: `Reinvested premium: bought ${data.shares} ${underlying.symbol} @ $${data.price}`,
      premiumFunded: true,
      reinvestSignalId: data.signalId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
