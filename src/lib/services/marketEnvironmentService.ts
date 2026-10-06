import { Prisma } from "@prisma/client";
import type { MarketBias, VolatilityCondition, BreadthCondition } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  computeEnvironmentScore,
  scoreToLabel,
  computeConfidence,
  computeAlignmentScore,
} from "./marketEnvironmentEngine";
import { VIX_SYMBOL } from "@/lib/marketRoutineSymbols";

type PrismaTx = Omit<Prisma.TransactionClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const MAIN_INDICES = ["SPY", "QQQ", "DIA", "IWM"];

function deriveRoutineInputFromSymbolBiases(
  symbolBiases: { symbol: string; bias: MarketBias | null }[],
  fallback: {
    humanMarketBias: MarketBias | null;
    volatilityCondition: VolatilityCondition | null;
    breadthCondition: BreadthCondition | null;
  }
) {
  const bySymbol = new Map(symbolBiases.map((s) => [s.symbol, s.bias]));

  // Human bias: majority of main indices (SPY, QQQ, DIA, IWM)
  let humanMarketBias: MarketBias | null = fallback.humanMarketBias;
  const mainBias = MAIN_INDICES.map((sym) => bySymbol.get(sym)).filter(Boolean) as MarketBias[];
  if (mainBias.length > 0) {
    const bullish = mainBias.filter((b) => b === "BULLISH").length;
    const bearish = mainBias.filter((b) => b === "BEARISH").length;
    if (bullish > bearish) humanMarketBias = "BULLISH";
    else if (bearish > bullish) humanMarketBias = "BEARISH";
    else humanMarketBias = "NEUTRAL";
  }

  // Volatility from VIX: VIX Bearish (low) = CONTRACTING, VIX Bullish (high) = EXPANDING
  let volatilityCondition: VolatilityCondition | null = fallback.volatilityCondition;
  const vixBias = bySymbol.get(VIX_SYMBOL);
  if (vixBias === "BEARISH") volatilityCondition = "CONTRACTING";
  else if (vixBias === "BULLISH") volatilityCondition = "EXPANDING";

  // Breadth: AR Hi-Low removed; use fallback
  const breadthCondition = fallback.breadthCondition;

  return {
    humanMarketBias,
    shortTermTrend: humanMarketBias,
    intermediateTrend: humanMarketBias,
    longTermTrend: humanMarketBias,
    volatilityCondition,
    breadthCondition,
  };
}

/**
 * Recompute and upsert MarketEnvironment for a user/date from current routine + AI insights.
 * Volatility is derived from VIX symbol bias. Human bias and breadth derived from indices/symbol biases.
 */
export async function upsertMarketEnvironment(
  userId: string,
  dateStr: string,
  tx?: PrismaTx
): Promise<void> {
  const client = tx ?? prisma;
  const date = new Date(dateStr + "T00:00:00.000Z");

  const [routine, aiInsights] = await Promise.all([
    client.marketRoutineEntry.findUnique({
      where: { userId_date: { userId, date } },
      include: { symbolBiases: true },
    }),
    client.aIChartInsight.findMany({
      where: { userId, date },
    }),
  ]);

  const fallback = {
    humanMarketBias: routine?.humanMarketBias ?? null,
    volatilityCondition: routine?.volatilityCondition ?? null,
    breadthCondition: routine?.breadthCondition ?? null,
  };

  const routineInput =
    routine && routine.symbolBiases.length > 0
      ? deriveRoutineInputFromSymbolBiases(routine.symbolBiases, fallback)
      : routine
        ? {
            humanMarketBias: routine.humanMarketBias,
            shortTermTrend: routine.shortTermTrend,
            intermediateTrend: routine.intermediateTrend,
            longTermTrend: routine.longTermTrend,
            volatilityCondition: routine.volatilityCondition,
            breadthCondition: routine.breadthCondition,
          }
        : {
            humanMarketBias: null,
            shortTermTrend: null,
            intermediateTrend: null,
            longTermTrend: null,
            volatilityCondition: null,
            breadthCondition: null,
          };

  const aiInputs = aiInsights.map((a) => ({
    aiTrendAssessment: a.aiTrendAssessment,
    aiVolumeCondition: a.aiVolumeCondition,
    aiMAStatus: a.aiMAStatus,
    timeframe: a.timeframe,
  }));

  const score = computeEnvironmentScore(routineInput, aiInputs);
  const label = scoreToLabel(score);
  const confidence = computeConfidence(routineInput, aiInputs);

  const firstInsight = aiInsights[0];
  const alignmentScore = firstInsight
    ? computeAlignmentScore(
        routine?.humanMarketBias ?? null,
        firstInsight.aiTrendAssessment,
        firstInsight.aiVolumeCondition,
        firstInsight.aiMAStatus
      )
    : null;

  await client.marketEnvironment.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      environmentScore: score,
      environmentLabel: label,
      environmentConfidence: confidence,
      alignmentScore: alignmentScore != null ? new Prisma.Decimal(alignmentScore) : null,
    },
    update: {
      environmentScore: score,
      environmentLabel: label,
      environmentConfidence: confidence,
      alignmentScore: alignmentScore != null ? new Prisma.Decimal(alignmentScore) : null,
    },
  });
}
