import { prisma } from "@/lib/db";
import { ENVIRONMENT_LABELS, type EnvironmentLabel } from "./marketEnvironmentEngine";

export type StrategyRecommendation = {
  favor: string[];
  avoid: string[];
  exposureBias: "Positive Delta" | "Neutral" | "Defensive";
  positionSizeAdjustment: number;
};

const STRATEGY_MAPPINGS: Record<string, StrategyRecommendation> = {
  [ENVIRONMENT_LABELS.TRENDING_RISK_ON]: {
    favor: [
      "Cash Secured Puts",
      "Bull Put Credit Spreads",
      "Covered Calls on Leaders",
    ],
    avoid: ["Long Puts", "Heavy Hedging"],
    exposureBias: "Positive Delta",
    positionSizeAdjustment: 1.0,
  },
  [ENVIRONMENT_LABELS.MILD_RISK_ON]: {
    favor: [
      "Cash Secured Puts",
      "Bull Put Spreads",
      "Covered Calls",
    ],
    avoid: ["Naked Puts (aggressive)", "Heavy Hedging"],
    exposureBias: "Positive Delta",
    positionSizeAdjustment: 0.9,
  },
  [ENVIRONMENT_LABELS.MIXED_TRANSITIONAL]: {
    favor: [
      "Defined Risk Spreads",
      "Iron Condors",
      "Strangles (small size)",
    ],
    avoid: ["Naked Premium Selling", "Large directional bets"],
    exposureBias: "Neutral",
    positionSizeAdjustment: 0.75,
  },
  [ENVIRONMENT_LABELS.MILD_RISK_OFF]: {
    favor: [
      "Bear Call Spreads",
      "Defined Risk Spreads",
      "Protective Puts (hedging)",
    ],
    avoid: ["Naked Calls", "Heavy Bull Put Selling"],
    exposureBias: "Defensive",
    positionSizeAdjustment: 0.75,
  },
  [ENVIRONMENT_LABELS.HIGH_VOL_RISK_OFF]: {
    favor: [
      "Protective Puts",
      "Smaller Defined Risk Spreads",
      "Reduced position size",
    ],
    avoid: ["Naked Premium Selling", "Selling volatility"],
    exposureBias: "Defensive",
    positionSizeAdjustment: 0.5,
  },
};

export function getStrategyRecommendations(
  environmentLabel: string
): StrategyRecommendation {
  return (
    STRATEGY_MAPPINGS[environmentLabel] ?? {
      favor: ["Defined risk only"],
      avoid: ["Naked options"],
      exposureBias: "Neutral",
      positionSizeAdjustment: 0.75,
    }
  );
}

export function getExposureBias(environmentLabel: string): StrategyRecommendation["exposureBias"] {
  return getStrategyRecommendations(environmentLabel).exposureBias;
}

export function getPositionSizeAdjustment(environmentLabel: string): number {
  return getStrategyRecommendations(environmentLabel).positionSizeAdjustment;
}

export type StrategyPerformanceRow = {
  strategyType: string;
  label: string;
  tradeCount: number;
  winners: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
};

/**
 * Rank strategies by historical performance in the given market environment.
 */
export async function rankStrategiesByHistoricalPerformance(
  userId: string,
  environmentLabel: EnvironmentLabel | string
): Promise<StrategyPerformanceRow[]> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const trades = await prisma.journalTrade.findMany({
    where: {
      accountId: { in: accountIds },
      marketEnvironmentAtEntry: environmentLabel,
      exitPrice: { not: null },
    },
    include: {
      strategyInstance: { select: { strategyType: true } },
      underlying: { select: { symbol: true } },
    },
  });

  const byStrategy = new Map<
    string,
    { trades: typeof trades; pnls: number[] }
  >();

  for (const t of trades) {
    const strategyType = t.strategyInstance?.strategyType ?? "OTHER";
    if (!byStrategy.has(strategyType)) {
      byStrategy.set(strategyType, { trades: [], pnls: [] });
    }
    const entry = byStrategy.get(strategyType)!;
    entry.trades.push(t);

    let pnl = 0;
    if (t.entryPrice != null && t.exitPrice != null && t.quantity != null) {
      const qty = Number(t.quantity);
      const entryP = Number(t.entryPrice);
      const exitP = Number(t.exitPrice);
      if (t.callPut && t.longShort === "SHORT") {
        pnl = (entryP - exitP) * qty * 100;
      } else {
        pnl = (exitP - entryP) * qty * 100;
      }
    }
    entry.pnls.push(pnl);
  }

  const strategyLabels: Record<string, string> = {
    COVERED_CALL: "Covered Call",
    SHORT_PUT: "Short Put",
    BULL_PUT_SPREAD: "Bull Put Spread",
    BEAR_CALL_SPREAD: "Bear Call Spread",
    IRON_CONDOR: "Iron Condor",
    SHORT_STRANGLE: "Short Strangle",
    TIME_SPREAD: "Time Spread",
    LEAP_CALL: "LEAP Call",
    LEAP_PUT: "LEAP Put",
    OTHER: "Other",
  };

  const rows: StrategyPerformanceRow[] = [];
  for (const [strategyType, { trades: ts, pnls }] of byStrategy.entries()) {
    const winners = pnls.filter((p) => p > 0).length;
    const totalPnl = pnls.reduce((a, b) => a + b, 0);
    rows.push({
      strategyType,
      label: strategyLabels[strategyType] ?? strategyType,
      tradeCount: ts.length,
      winners,
      winRate: ts.length > 0 ? winners / ts.length : 0,
      totalPnl,
      avgPnl: pnls.length > 0 ? totalPnl / pnls.length : 0,
    });
  }

  rows.sort((a, b) => b.winRate - a.winRate);
  return rows;
}
