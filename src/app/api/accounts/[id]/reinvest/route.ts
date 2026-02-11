import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { reinvestActionSchema } from "@/lib/validations";
import {
  getPendingSignals,
  getReinvestReadyAmount,
  processReinvestAction,
} from "@/lib/services/reinvestSignals";

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

    const [signals, readyAmount] = await Promise.all([
      getPendingSignals(accountId),
      getReinvestReadyAmount(accountId),
    ]);

    return NextResponse.json({
      signals,
      reinvestReady: readyAmount.toFixed(2),
    });
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
    const { searchParams } = new URL(req.url);
    const signalId = searchParams.get("signalId");

    if (!signalId) {
      return NextResponse.json({ error: "signalId required" }, { status: 400 });
    }

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Verify signal belongs to this account
    const signal = await prisma.reinvestSignal.findFirst({
      where: { id: signalId, accountId },
    });
    if (!signal) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    const body = await req.json();
    const data = reinvestActionSchema.parse(body);

    const updated = await processReinvestAction(
      signalId,
      data.action,
      data.partialAmount,
      data.notes
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
