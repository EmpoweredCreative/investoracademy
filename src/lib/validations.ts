import { z } from "zod";
import { bucketSchema, CORE_PLAN_MODES } from "@/lib/buckets";

// ─── Auth ───────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

// ─── Account ────────────────────────────────────────────────
export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  mode: z.enum(["SIMULATED", "LIVE_SCHWAB"]),
  defaultPolicy: z.enum(["CASHFLOW", "BASIS_REDUCTION", "REINVEST_ON_CLOSE"]).nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export const updateAccountSchema = createAccountSchema.partial().extend({
  defaultPolicy: z.enum(["CASHFLOW", "BASIS_REDUCTION", "REINVEST_ON_CLOSE"]).nullable().optional(),
  cashBalance: z.number().min(0).optional(),
  cashflowReserve: z.number().min(0).optional(),
  onboardingCompletedAt: z.string().datetime().nullable().optional(),
});

// ─── Manual Stock Entry ─────────────────────────────────────
export const stockEntrySchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  action: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  fees: z.number().min(0).default(0),
  occurredAt: z.string().datetime(),
  wheelCategory: bucketSchema.default("CORE"),
  notes: z.string().max(1000).optional(),
  exitPrice: z.number().positive().optional(),
  exitDateTime: z.string().datetime().optional(),
});

// ─── Manual Option Entry ────────────────────────────────────
export const optionLegSchema = z.object({
  action: z.enum(["STO", "BTC", "BTO", "STC", "EXPIRE", "ASSIGN", "EXERCISE"]),
  callPut: z.enum(["CALL", "PUT"]),
  strike: z.number().positive(),
  quantity: z.number().positive(),
  price: z.number().min(0),
  entryDelta: z.number().min(-1).max(1).optional(),
});

export const optionEntrySchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  action: z.enum(["STO", "BTC", "BTO", "STC", "EXPIRE", "ASSIGN", "EXERCISE"]),
  callPut: z.enum(["CALL", "PUT"]),
  strike: z.number().positive(),
  expiration: z.string().datetime(),
  quantity: z.number().positive(),
  price: z.number().min(0),
  entryDelta: z.number().min(-1).max(1).optional(),
  fees: z.number().min(0).default(0),
  occurredAt: z.string().datetime(),
  strategyType: z.enum([
    "COVERED_CALL", "SHORT_PUT",
    "BULL_PUT_SPREAD", "BEAR_CALL_SPREAD",
    "BULL_CALL_SPREAD", "BEAR_PUT_SPREAD",
    "IRON_CONDOR", "IRON_BUTTERFLY",
    "SHORT_STRANGLE", "TIME_SPREAD",
    "LEAP_CALL", "LEAP_PUT",
  ]).optional(),
  premiumPolicyOverride: z.enum(["CASHFLOW", "BASIS_REDUCTION", "REINVEST_ON_CLOSE"]).optional(),
  wheelCategoryOverride: bucketSchema.optional(),
  notes: z.string().max(1000).optional(),
  // Additional legs for multi-leg strategies
  additionalLegs: z.array(optionLegSchema).optional(),
  // Optional exit when recording a full round-trip on add
  exitPrice: z.number().min(0).optional(),
  exitDateTime: z.string().datetime().optional(),
});

// ─── Reinvest Signal Action ─────────────────────────────────
export const reinvestActionSchema = z.object({
  action: z.enum(["CONFIRM_FULL", "CONFIRM_PARTIAL", "SNOOZE", "SKIP"]),
  partialAmount: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
});

// ─── Wealth Wheel ───────────────────────────────────────────
export const wheelTargetSchema = z.object({
  targets: z.array(
    z.object({
      category: bucketSchema,
      targetPct: z.number().min(0).max(100),
    })
  ).refine(
    (targets) => {
      const sum = targets.reduce((acc, t) => acc + t.targetPct, 0);
      return Math.abs(sum - 100) < 0.01;
    },
    { message: "Target percentages must sum to 100%" }
  ),
});

export const wheelClassificationSchema = z.object({
  underlyingId: z.string(),
  category: bucketSchema,
});

// ─── Journal Trade ──────────────────────────────────────────
export const journalTradeSchema = z.object({
  underlyingId: z.string(),
  strategyInstanceId: z.string().optional(),
  strike: z.number().nullable().optional(),
  callPut: z.enum(["CALL", "PUT"]).nullable().optional(),
  longShort: z.enum(["LONG", "SHORT"]).optional(),
  quantity: z.number().positive().nullable().optional(),
  entryDelta: z.number().min(-1).max(1).nullable().optional(),
  entryPrice: z.number().nullable().optional(),
  entryDateTime: z.string().datetime().nullable().optional(),
  targetPrice: z.number().nullable().optional(),
  stopPrice: z.number().nullable().optional(),
  exitPrice: z.number().nullable().optional(),
  exitDateTime: z.string().datetime().nullable().optional(),
  fees: z.number().min(0).optional(),
  rewardRatio: z.number().nullable().optional(),
  riskPct: z.number().nullable().optional(),
  thesisNotes: z.string().max(5000).nullable().optional(),
  outcomeRating: z.enum(["EXCELLENT", "GOOD", "NEUTRAL", "POOR", "TERRIBLE"]).nullable().optional(),
  wheelCategoryOverride: bucketSchema.nullable().optional(),
});

// ─── Research Idea ──────────────────────────────────────────
export const researchIdeaSchema = z.object({
  underlyingId: z.string().optional(),
  symbol: z.string().min(1).max(10).optional(),
  strategyType: z.enum([
    "COVERED_CALL",
    "SHORT_PUT",
    "BULL_PUT_SPREAD",
    "BEAR_CALL_SPREAD",
    "BULL_CALL_SPREAD",
    "BEAR_PUT_SPREAD",
    "IRON_CONDOR",
    "IRON_BUTTERFLY",
    "SHORT_STRANGLE",
    "TIME_SPREAD",
    "LEAP_CALL",
    "LEAP_PUT",
  ]),
  dte: z.number().int().positive().optional(),
  atr: z.number().positive().optional(),
  strikes: z.string().max(200).optional(),
  deltas: z.string().max(200).optional(),
  netCredit: z.number().optional(),
  bpe: z.number().positive().optional(),
  netDelta: z.number().optional(),
  roi: z.number().optional(),
  roid: z.number().optional(),
  notes: z.string().max(5000).optional(),
  wheelCategoryOverride: bucketSchema.optional(),

  // Strategy-specific typed fields
  price: z.number().positive().optional(),
  month: z.string().max(20).optional(),
  shortStrike: z.number().positive().optional(),
  shortDelta: z.number().min(-1).max(1).optional(),
  longStrike: z.number().positive().optional(),
  shortCallStrike: z.number().positive().optional(),
  shortCallDelta: z.number().min(-1).max(1).optional(),
  longCallStrike: z.number().positive().optional(),
  shortPutStrike: z.number().positive().optional(),
  shortPutDelta: z.number().min(-1).max(1).optional(),
  longPutStrike: z.number().positive().optional(),
  earningsDate: z.string().max(50).optional(),
  expectedGap: z.number().optional(),
  expiration: z.string().max(50).optional(),
  spreadSubType: z.string().max(50).optional(),
  longStrikeExp: z.string().max(50).optional(),
  longStrikeDebit: z.number().positive().optional(),
  shortStrikeExp: z.string().max(50).optional(),
  shortStrikeCredit: z.number().positive().optional(),
});

// ─── Cash Deposit ──────────────────────────────────────────
export const depositSchema = z.object({
  amount: z.number().positive(),
  occurredAt: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

// ─── Market Command Center ──────────────────────────────────
export const marketBiasEnum = z.enum(["BULLISH", "BEARISH", "NEUTRAL"]);
export const volatilityConditionEnum = z.enum(["EXPANDING", "CONTRACTING", "ELEVATED", "COMPRESSED"]);
export const breadthConditionEnum = z.enum(["BROAD", "NARROW", "MIXED"]);
export const aiMaStatusEnum = z.enum(["ABOVE_200", "BELOW_200", "MIXED"]);
export const aiVolumeConditionEnum = z.enum(["ACCUMULATION", "DISTRIBUTION", "NEUTRAL"]);
export const chartSourceTypeEnum = z.enum(["CHART_UPLOAD", "DATA_FEED"]);

export const symbolBiasSchema = z.object({
  symbol: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  category: z.enum(["INDICES", "SECTORS"]),
  bias: marketBiasEnum.nullable().optional(),
  dailyVolume: z.number().min(0).nullable().optional(),
});

export const marketRoutineEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  humanMarketBias: marketBiasEnum.nullable().optional(),
  shortTermTrend: marketBiasEnum.nullable().optional(),
  intermediateTrend: marketBiasEnum.nullable().optional(),
  longTermTrend: marketBiasEnum.nullable().optional(),
  volatilityCondition: volatilityConditionEnum.nullable().optional(),
  breadthCondition: breadthConditionEnum.nullable().optional(),
  narrativeTags: z.array(z.string().max(50)).optional().default([]),
  notes: z.string().max(5000).nullable().optional(),
  routineCompleted: z.boolean().optional().default(false),
  symbolBiases: z.array(symbolBiasSchema).optional().default([]),
});

export const aiChartInsightSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  symbol: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  timeframe: z.string().max(50).nullable().optional(),
  aiTrendAssessment: marketBiasEnum.nullable().optional(),
  aiMomentumAssessment: z.string().max(200).nullable().optional(),
  aiMAStatus: aiMaStatusEnum.nullable().optional(),
  aiVolumeCondition: aiVolumeConditionEnum.nullable().optional(),
  aiStructureNotes: z.string().max(2000).nullable().optional(),
  aiConfidenceScore: z.number().int().min(0).max(100).nullable().optional(),
  sourceType: chartSourceTypeEnum.optional().default("CHART_UPLOAD"),
  rawAIResponse: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ─── CSV Import ─────────────────────────────────────────────
export const csvRowSchema = z.object({
  account_name: z.string().min(1),
  trade_datetime: z.string().min(1),
  symbol: z.string().min(1),
  instrument_type: z.enum(["STOCK", "OPTION"]),
  action: z.string().min(1),
  quantity: z.string().min(1),
  price: z.string().min(1),
  fees: z.string().optional().default("0"),
  expiration: z.string().optional(),
  strike: z.string().optional(),
  call_put: z.string().optional(),
  external_trade_id: z.string().optional(),
  notes: z.string().optional(),
});

// ─── Fundamental Research ─────────────────────────────────────
export const fundamentalWatchlistPostSchema = z.object({
  symbol: z.string().min(1).max(10),
});

export const fundamentalResearchPatchSchema = z.object({
  verdict: z.enum(["PASS", "WATCH", "REJECT"]).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  earningsReviewed: z.boolean().optional(),
  earningsNotes: z.string().max(5000).nullable().optional(),
  // 1–5 scores (null clears).
  mgmtCapitalAllocation: z.number().int().min(1).max(5).nullable().optional(),
  mgmtIncentives: z.number().int().min(1).max(5).nullable().optional(),
  mgmtExecution: z.number().int().min(1).max(5).nullable().optional(),
  brandPricingPower: z.number().int().min(1).max(5).nullable().optional(),
  brandLoyalty: z.number().int().min(1).max(5).nullable().optional(),
  brandTrust: z.number().int().min(1).max(5).nullable().optional(),
});

export const fundamentalChatPostSchema = z.object({
  message: z.string().min(1).max(4000),
  /** Investor lens key (see src/lib/research/lenses.ts); null for no lens. */
  lens: z.string().max(64).nullish(),
});

// ─── Core Premium Bucket ────────────────────────────────────
export const corePlanSchema = z.object({
  mode: z.enum(CORE_PLAN_MODES),
  shareGoal: z.number().int().positive().nullable().optional(),
  modeAfterGoal: z.enum(CORE_PLAN_MODES).default("INCOME"),
  reinvestThresholdShares: z.number().int().min(1).default(1),
});

export const coreReinvestSchema = z.object({
  shares: z.number().positive(),
  price: z.number().positive(),
  fees: z.number().min(0).default(0),
  occurredAt: z.string().datetime(),
  signalId: z.string().optional(),
});
