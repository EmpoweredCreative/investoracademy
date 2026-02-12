import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";

/**
 * GET /api/accounts/[id]/journal/insights
 *
 * Returns option trade performance insights grouped by:
 *   1. Trade type (CALL / PUT)
 *   2. Delta bucket (0–0.10, 0.10–0.20, 0.20–0.30, 0.30–0.40, 0.40–0.50, 0.50+)
 *
 * Each bucket contains:
 *   - totalTrades, closedTrades, openTrades
 *   - winners, losers
 *   - winRate (%)
 *   - totalPnl, avgPnl
 *   - avgEntryDelta
 */

interface DeltaBucket {
  label: string;
  min: number;
  max: number;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  avgEntryDelta: number;
}

interface TradeTypeInsight {
  callPut: "CALL" | "PUT";
  label: string;
  totalTrades: number;
  closedTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  deltaBreakdown: DeltaBucket[];
}

const DELTA_BUCKETS = [
  { label: "0 – 0.10", min: 0, max: 0.1 },
  { label: "0.10 – 0.20", min: 0.1, max: 0.2 },
  { label: "0.20 – 0.30", min: 0.2, max: 0.3 },
  { label: "0.30 – 0.40", min: 0.3, max: 0.4 },
  { label: "0.40 – 0.50", min: 0.4, max: 0.5 },
  { label: "0.50+", min: 0.5, max: 1.01 },
];

export async function GET(
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
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Fetch short option journal trades that have a delta recorded
    const optionTrades = await prisma.journalTrade.findMany({
      where: {
        accountId,
        longShort: "SHORT",
        callPut: { not: null },
        entryDelta: { not: null },
      },
      include: {
        underlying: true,
        strategyInstance: true,
      },
      orderBy: { entryDateTime: "desc" },
    });

    // Build per-trade-type insights
    const insightsByType: TradeTypeInsight[] = [];

    for (const callPut of ["CALL", "PUT"] as const) {
      const typeTrades = optionTrades.filter((t) => t.callPut === callPut);
      if (typeTrades.length === 0) continue;

      // Overall stats for this trade type
      let typeClosedTrades = 0;
      let typeWinners = 0;
      let typeLosers = 0;
      let typeTotalPnl = 0;

      for (const trade of typeTrades) {
        const entry = trade.entryPrice
          ? parseFloat(trade.entryPrice.toString())
          : 0;
        const exit = trade.exitPrice
          ? parseFloat(trade.exitPrice.toString())
          : null;
        const qty = trade.quantity
          ? parseFloat(trade.quantity.toString())
          : 1;

        if (exit !== null) {
          typeClosedTrades++;
          // For short options: profit = (entry - exit) * qty * 100
          const pnl = (entry - exit) * qty * 100;
          typeTotalPnl += pnl;
          if (pnl > 0) typeWinners++;
          else typeLosers++;
        }
      }

      const typeWinRate =
        typeClosedTrades > 0 ? (typeWinners / typeClosedTrades) * 100 : 0;
      const typeAvgPnl =
        typeClosedTrades > 0 ? typeTotalPnl / typeClosedTrades : 0;

      // Delta breakdown
      const deltaBreakdown: DeltaBucket[] = [];

      for (const bucket of DELTA_BUCKETS) {
        const bucketTrades = typeTrades.filter((t) => {
          if (!t.entryDelta) return false;
          const absDelta = Math.abs(parseFloat(t.entryDelta.toString()));
          return absDelta >= bucket.min && absDelta < bucket.max;
        });

        if (bucketTrades.length === 0) continue;

        let closedTrades = 0;
        let openTrades = 0;
        let winners = 0;
        let losers = 0;
        let totalPnl = 0;
        let deltaSum = 0;

        for (const trade of bucketTrades) {
          const entry = trade.entryPrice
            ? parseFloat(trade.entryPrice.toString())
            : 0;
          const exit = trade.exitPrice
            ? parseFloat(trade.exitPrice.toString())
            : null;
          const qty = trade.quantity
            ? parseFloat(trade.quantity.toString())
            : 1;
          const delta = trade.entryDelta
            ? parseFloat(trade.entryDelta.toString())
            : 0;
          deltaSum += Math.abs(delta);

          if (exit !== null) {
            closedTrades++;
            const pnl = (entry - exit) * qty * 100;
            totalPnl += pnl;
            if (pnl > 0) winners++;
            else losers++;
          } else {
            openTrades++;
          }
        }

        const winRate =
          closedTrades > 0 ? (winners / closedTrades) * 100 : 0;
        const avgPnl = closedTrades > 0 ? totalPnl / closedTrades : 0;
        const avgEntryDelta =
          bucketTrades.length > 0 ? deltaSum / bucketTrades.length : 0;

        deltaBreakdown.push({
          label: bucket.label,
          min: bucket.min,
          max: bucket.max,
          totalTrades: bucketTrades.length,
          closedTrades,
          openTrades,
          winners,
          losers,
          winRate: parseFloat(winRate.toFixed(1)),
          totalPnl: parseFloat(totalPnl.toFixed(2)),
          avgPnl: parseFloat(avgPnl.toFixed(2)),
          avgEntryDelta: parseFloat(avgEntryDelta.toFixed(4)),
        });
      }

      insightsByType.push({
        callPut,
        label: callPut === "CALL" ? "Covered Calls" : "Short Puts",
        totalTrades: typeTrades.length,
        closedTrades: typeClosedTrades,
        winners: typeWinners,
        losers: typeLosers,
        winRate: parseFloat(typeWinRate.toFixed(1)),
        totalPnl: parseFloat(typeTotalPnl.toFixed(2)),
        avgPnl: parseFloat(typeAvgPnl.toFixed(2)),
        deltaBreakdown,
      });
    }

    // Summary across all option types (only trades with delta)
    const totalTrades = optionTrades.length;
    const totalClosedTrades = insightsByType.reduce(
      (acc, t) => acc + t.closedTrades,
      0
    );
    const totalPnl = insightsByType.reduce((acc, t) => acc + t.totalPnl, 0);

    return NextResponse.json({
      summary: {
        totalTrades,
        totalClosedTrades,
        totalPnl: parseFloat(totalPnl.toFixed(2)),
        avgPnl:
          totalClosedTrades > 0
            ? parseFloat((totalPnl / totalClosedTrades).toFixed(2))
            : 0,
      },
      byType: insightsByType,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
