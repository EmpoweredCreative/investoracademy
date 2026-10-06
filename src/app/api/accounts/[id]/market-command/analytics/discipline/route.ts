import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";

export async function GET(
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

    const trades = await prisma.journalTrade.findMany({
      where: { accountId, exitPrice: { not: null } },
      include: { strategyInstance: { include: { ledgerEntries: true } } },
    });

    const withRoutine = trades.filter((t) => t.routineCompletedAtEntry);
    const withoutRoutine = trades.filter((t) => !t.routineCompletedAtEntry);

    const pnl = (t: (typeof trades)[0]) => {
      if (!t.strategyInstance?.ledgerEntries) return 0;
      let n = 0;
      for (const e of t.strategyInstance.ledgerEntries) {
        const amt = Number(e.amount);
        if (e.type === "PREMIUM_CREDIT") n += amt;
        else if (e.type === "PREMIUM_DEBIT" || e.type === "FEE") n -= amt;
      }
      return n;
    };

    const winRate = (list: typeof trades) => {
      if (list.length === 0) return 0;
      return list.filter((t) => pnl(t) > 0).length / list.length;
    };

    const avgPnl = (list: typeof trades) => {
      if (list.length === 0) return 0;
      return list.reduce((a, t) => a + pnl(t), 0) / list.length;
    };

    return NextResponse.json({
      routineCompleted: {
        tradeCount: withRoutine.length,
        winRate: winRate(withRoutine),
        avgPnl: avgPnl(withRoutine),
      },
      routineSkipped: {
        tradeCount: withoutRoutine.length,
        winRate: winRate(withoutRoutine),
        avgPnl: avgPnl(withoutRoutine),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
