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

    const byEnv = new Map<
      string,
      { count: number; winners: number; pnls: number[] }
    >();

    for (const t of trades) {
      const env = t.marketEnvironmentAtEntry ?? "No Environment";
      if (!byEnv.has(env)) byEnv.set(env, { count: 0, winners: 0, pnls: [] });
      const entry = byEnv.get(env)!;
      entry.count += 1;

      let pnl = 0;
      if (t.strategyInstance?.ledgerEntries) {
        for (const e of t.strategyInstance.ledgerEntries) {
          const amt = Number(e.amount);
          if (e.type === "PREMIUM_CREDIT") pnl += amt;
          else if (e.type === "PREMIUM_DEBIT" || e.type === "FEE") pnl -= amt;
        }
      }
      entry.pnls.push(pnl);
      if (pnl > 0) entry.winners += 1;
    }

    const byEnvironment = Array.from(byEnv.entries()).map(([label, v]) => ({
      label,
      count: v.count,
      winRate: v.count > 0 ? v.winners / v.count : 0,
      roi: v.pnls.length > 0 ? v.pnls.reduce((a, b) => a + b, 0) / v.pnls.length : 0,
    }));

    return NextResponse.json({ byEnvironment });
  } catch (error) {
    return handleApiError(error);
  }
}
