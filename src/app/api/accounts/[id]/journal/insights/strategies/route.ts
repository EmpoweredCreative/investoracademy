import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";

/**
 * GET /api/accounts/[id]/journal/insights/strategies
 *
 * Returns option trade performance grouped by strategy type.
 * Multi-leg strategies (same strategyGroupId) are counted once; P/L is from
 * strategy instance realizedOptionProfit to avoid double-counting.
 */

interface StrategyInsight {
  strategyType: string;
  label: string;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
}

const STRATEGY_TYPE_LABELS: Record<string, string> = {
  BULL_PUT_SPREAD: "Bull Put Spread",
  BEAR_CALL_SPREAD: "Bear Call Spread",
  BULL_CALL_SPREAD: "Bull Call Spread",
  BEAR_PUT_SPREAD: "Bear Put Spread",
  IRON_CONDOR: "Iron Condor",
  IRON_BUTTERFLY: "Iron Butterfly",
  SHORT_STRANGLE: "Short Strangle",
  TIME_SPREAD: "Time Spread",
  COVERED_CALL: "Covered Call",
  SHORT_PUT: "Short Put",
  LEAP_CALL: "LEAP Call",
  LEAP_PUT: "LEAP Put",
  SINGLE_LEG: "Single-leg / Unspecified",
};

function getStrategyLabel(strategyType: string | null): string {
  if (!strategyType) return STRATEGY_TYPE_LABELS.SINGLE_LEG;
  return STRATEGY_TYPE_LABELS[strategyType] ?? strategyType;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const optionTrades = await prisma.journalTrade.findMany({
      where: {
        accountId,
        callPut: { not: null },
      },
      include: {
        strategyInstance: { include: { ledgerEntries: true } },
      },
      orderBy: { entryDateTime: "desc" },
    });

    const getTradeFees = (trade: (typeof optionTrades)[0]) => {
      if (!trade.strategyInstance?.ledgerEntries) return 0;
      return trade.strategyInstance.ledgerEntries
        .filter((e) => e.type === "FEE")
        .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
    };

    // Build unique "positions": one per strategy group (multi-leg) or per single trade
    type Position = {
      strategyType: string | null;
      pnl: number | null;
      closed: boolean;
    };
    const seenGroupIds = new Set<string>();
    const positions: Position[] = [];

    for (const trade of optionTrades) {
      const gid = trade.strategyInstance?.strategyGroupId ?? null;
      const strategyType = trade.strategyInstance?.strategyType ?? null;

      if (gid) {
        if (seenGroupIds.has(gid)) continue;
        seenGroupIds.add(gid);
        const finalized = trade.strategyInstance?.status === "FINALIZED";
        const pnl =
          finalized && trade.strategyInstance?.realizedOptionProfit != null
            ? parseFloat(trade.strategyInstance.realizedOptionProfit.toString())
            : null;
        positions.push({
          strategyType,
          pnl,
          closed: finalized,
        });
      } else {
        const entry = trade.entryPrice
          ? parseFloat(trade.entryPrice.toString())
          : 0;
        const exit = trade.exitPrice
          ? parseFloat(trade.exitPrice.toString())
          : null;
        const qty = trade.quantity
          ? parseFloat(trade.quantity.toString())
          : 1;
        let pnl: number | null = null;
        if (exit !== null) {
          const fees = getTradeFees(trade);
          pnl =
            trade.strategyInstance?.status === "FINALIZED" &&
            trade.strategyInstance.realizedOptionProfit != null
              ? parseFloat(trade.strategyInstance.realizedOptionProfit.toString())
              : (entry - exit) * qty * 100 - fees;
        }
        positions.push({
          strategyType,
          pnl,
          closed: pnl !== null,
        });
      }
    }

    // Aggregate by strategy type (use "SINGLE_LEG" for null)
    const byStrategy = new Map<
      string,
      { closed: number; open: number; winners: number; losers: number; totalPnl: number }
    >();

    for (const pos of positions) {
      const key = pos.strategyType ?? "SINGLE_LEG";
      if (!byStrategy.has(key)) {
        byStrategy.set(key, {
          closed: 0,
          open: 0,
          winners: 0,
          losers: 0,
          totalPnl: 0,
        });
      }
      const agg = byStrategy.get(key)!;
      if (pos.closed && pos.pnl !== null) {
        agg.closed++;
        agg.totalPnl += pos.pnl;
        if (pos.pnl > 0) agg.winners++;
        else agg.losers++;
      } else {
        agg.open++;
      }
    }

    const strategyInsights: StrategyInsight[] = [];
    for (const [strategyType, agg] of byStrategy.entries()) {
      const totalTrades = agg.closed + agg.open;
      if (totalTrades === 0) continue;
      const winRate =
        agg.closed > 0 ? (agg.winners / agg.closed) * 100 : 0;
      const avgPnl = agg.closed > 0 ? agg.totalPnl / agg.closed : 0;
      strategyInsights.push({
        strategyType,
        label: getStrategyLabel(strategyType),
        totalTrades,
        closedTrades: agg.closed,
        openTrades: agg.open,
        winners: agg.winners,
        losers: agg.losers,
        winRate: parseFloat(winRate.toFixed(1)),
        totalPnl: parseFloat(agg.totalPnl.toFixed(2)),
        avgPnl: parseFloat(avgPnl.toFixed(2)),
      });
    }

    strategyInsights.sort((a, b) => b.totalTrades - a.totalTrades);

    const summary = {
      totalStrategies: positions.length,
      totalClosed: strategyInsights.reduce((s, i) => s + i.closedTrades, 0),
      totalPnl: parseFloat(
        strategyInsights
          .reduce((s, i) => s + i.totalPnl, 0)
          .toFixed(2)
      ),
      avgPnl:
        strategyInsights.reduce((s, i) => s + i.closedTrades, 0) > 0
          ? parseFloat(
              (
                strategyInsights.reduce((s, i) => s + i.totalPnl, 0) /
                strategyInsights.reduce((s, i) => s + i.closedTrades, 0)
              ).toFixed(2)
            )
          : 0,
    };

    return NextResponse.json({
      summary,
      byStrategy: strategyInsights,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
