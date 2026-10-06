import type { MarketBias, VolatilityCondition, BreadthCondition, AIVolumeCondition } from "@prisma/client";

export type RoutineInput = {
  humanMarketBias: MarketBias | null;
  shortTermTrend: MarketBias | null;
  intermediateTrend: MarketBias | null;
  longTermTrend: MarketBias | null;
  volatilityCondition: VolatilityCondition | null;
  breadthCondition: BreadthCondition | null;
};

export type AIInsightInput = {
  aiTrendAssessment: MarketBias | null;
  aiVolumeCondition: AIVolumeCondition | null;
  aiMAStatus: string | null;
  timeframe?: string | null;
};

export const ENVIRONMENT_LABELS = {
  TRENDING_RISK_ON: "Trending Risk-On",
  MILD_RISK_ON: "Mild Risk-On",
  MIXED_TRANSITIONAL: "Mixed / Transitional",
  MILD_RISK_OFF: "Mild Risk-Off",
  HIGH_VOL_RISK_OFF: "High Vol Risk-Off",
} as const;

export type EnvironmentLabel = (typeof ENVIRONMENT_LABELS)[keyof typeof ENVIRONMENT_LABELS];

/**
 * Compute raw environment score from -100 to +100 using weighted inputs.
 */
export function computeEnvironmentScore(
  routine: RoutineInput,
  aiInsights: AIInsightInput[]
): number {
  let score = 0;

  // Human Bias: Bullish +30, Bearish -30
  if (routine.humanMarketBias === "BULLISH") score += 30;
  else if (routine.humanMarketBias === "BEARISH") score -= 30;

  // AI Trend: aggregate if multiple (Bullish +25, Bearish -25)
  if (aiInsights.length > 0) {
    const bullish = aiInsights.filter((a) => a.aiTrendAssessment === "BULLISH").length;
    const bearish = aiInsights.filter((a) => a.aiTrendAssessment === "BEARISH").length;
    const net = bullish - bearish;
    if (net > 0) score += 25;
    else if (net < 0) score -= 25;
  }

  // Volatility: Contracting +20, Expanding -20
  if (routine.volatilityCondition === "CONTRACTING") score += 20;
  else if (routine.volatilityCondition === "EXPANDING") score -= 20;

  // Breadth: Broad +15, Narrow -15
  if (routine.breadthCondition === "BROAD") score += 15;
  else if (routine.breadthCondition === "NARROW") score -= 15;

  // AI Volume (use first/latest or average): Accumulation +10, Distribution -10
  if (aiInsights.length > 0) {
    const acc = aiInsights.filter((a) => a.aiVolumeCondition === "ACCUMULATION").length;
    const dist = aiInsights.filter((a) => a.aiVolumeCondition === "DISTRIBUTION").length;
    const net = acc - dist;
    if (net > 0) score += 10;
    else if (net < 0) score -= 10;
  }

  return Math.max(-100, Math.min(100, score));
}

/**
 * Map numeric score to environment label.
 */
export function scoreToLabel(score: number): EnvironmentLabel {
  if (score >= 60) return ENVIRONMENT_LABELS.TRENDING_RISK_ON;
  if (score >= 20) return ENVIRONMENT_LABELS.MILD_RISK_ON;
  if (score >= -19) return ENVIRONMENT_LABELS.MIXED_TRANSITIONAL;
  if (score >= -59) return ENVIRONMENT_LABELS.MILD_RISK_OFF;
  return ENVIRONMENT_LABELS.HIGH_VOL_RISK_OFF;
}

/**
 * Compute environment confidence 0-100 based on alignment and breadth.
 */
export function computeConfidence(
  routine: RoutineInput,
  aiInsights: AIInsightInput[]
): number {
  let confidence = 50; // base

  // Multi-timeframe alignment: if routine has multiple trends and they agree
  const trends = [
    routine.shortTermTrend,
    routine.intermediateTrend,
    routine.longTermTrend,
  ].filter(Boolean) as MarketBias[];
  if (trends.length >= 2) {
    const allSame =
      trends.every((t) => t === trends[0]);
    if (allSame) confidence += 15;
  }

  // Human and AI agree on direction
  if (routine.humanMarketBias && aiInsights.length > 0) {
    const aiTrends = aiInsights.map((a) => a.aiTrendAssessment).filter(Boolean);
    const agree = aiTrends.some(
      (t) => t === routine.humanMarketBias
    );
    if (agree) confidence += 15;
  }

  // Breadth is broad
  if (routine.breadthCondition === "BROAD") confidence += 10;

  // Volume confirms (AI accumulation with bullish or distribution with bearish)
  if (aiInsights.length > 0 && routine.humanMarketBias) {
    const vol = aiInsights[0].aiVolumeCondition;
    if (
      (routine.humanMarketBias === "BULLISH" && vol === "ACCUMULATION") ||
      (routine.humanMarketBias === "BEARISH" && vol === "DISTRIBUTION")
    ) {
      confidence += 10;
    }
  }

  return Math.min(100, confidence);
}

/**
 * Alignment score 0-100: percent match across human bias, AI trend, volume, MA.
 * Pass in normalized values (e.g. BULLISH/BEARISH/NEUTRAL for bias and trend).
 */
export function computeAlignmentScore(
  humanBias: MarketBias | null,
  aiTrend: MarketBias | null,
  volumeCondition: AIVolumeCondition | null,
  maStatus: string | null
): number {
  let match = 0;
  let total = 0;

  if (humanBias != null && aiTrend != null) {
    total += 1;
    if (humanBias === aiTrend) match += 1;
  }

  if (humanBias != null && volumeCondition != null) {
    total += 1;
    const volumeConfirms =
      (humanBias === "BULLISH" && volumeCondition === "ACCUMULATION") ||
      (humanBias === "BEARISH" && volumeCondition === "DISTRIBUTION") ||
      (humanBias === "NEUTRAL" && volumeCondition === "NEUTRAL");
    if (volumeConfirms) match += 1;
  }

  if (humanBias != null && maStatus != null) {
    total += 1;
    const maConfirms =
      (humanBias === "BULLISH" && maStatus === "ABOVE_200") ||
      (humanBias === "BEARISH" && maStatus === "BELOW_200") ||
      (humanBias === "NEUTRAL" && (maStatus === "MIXED" || maStatus === "ABOVE_200" || maStatus === "BELOW_200"));
    if (maConfirms) match += 1;
  }

  if (total === 0) return 0;
  return Math.round((match / total) * 100);
}
