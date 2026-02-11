import { z } from "zod";

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
  defaultPolicy: z.enum(["CASHFLOW", "BASIS_REDUCTION", "REINVEST_ON_CLOSE"]).optional(),
  notes: z.string().max(1000).optional(),
});

export const updateAccountSchema = createAccountSchema.partial();

// ─── Manual Stock Entry ─────────────────────────────────────
export const stockEntrySchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  action: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  fees: z.number().min(0).default(0),
  occurredAt: z.string().datetime(),
  notes: z.string().max(1000).optional(),
});

// ─── Manual Option Entry ────────────────────────────────────
export const optionEntrySchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  action: z.enum(["STO", "BTC", "BTO", "STC", "EXPIRE", "ASSIGN", "EXERCISE"]),
  callPut: z.enum(["CALL", "PUT"]),
  strike: z.number().positive(),
  expiration: z.string().datetime(),
  quantity: z.number().positive(),
  price: z.number().min(0),
  fees: z.number().min(0).default(0),
  occurredAt: z.string().datetime(),
  premiumPolicyOverride: z.enum(["CASHFLOW", "BASIS_REDUCTION", "REINVEST_ON_CLOSE"]).optional(),
  wheelCategoryOverride: z.enum(["CORE", "MAD_MONEY", "FREE_CAPITAL", "RISK_MGMT"]).optional(),
  notes: z.string().max(1000).optional(),
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
      category: z.enum(["CORE", "MAD_MONEY", "FREE_CAPITAL", "RISK_MGMT"]),
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
  category: z.enum(["CORE", "MAD_MONEY", "FREE_CAPITAL", "RISK_MGMT"]),
});

// ─── Journal Trade ──────────────────────────────────────────
export const journalTradeSchema = z.object({
  underlyingId: z.string(),
  strategyInstanceId: z.string().optional(),
  strike: z.number().optional(),
  callPut: z.enum(["CALL", "PUT"]).optional(),
  longShort: z.enum(["LONG", "SHORT"]).optional(),
  quantity: z.number().positive().optional(),
  entryPrice: z.number().optional(),
  entryDateTime: z.string().datetime().optional(),
  targetPrice: z.number().optional(),
  stopPrice: z.number().optional(),
  exitPrice: z.number().optional(),
  exitDateTime: z.string().datetime().optional(),
  rewardRatio: z.number().optional(),
  riskPct: z.number().optional(),
  thesisNotes: z.string().max(5000).optional(),
  outcomeRating: z.enum(["EXCELLENT", "GOOD", "NEUTRAL", "POOR", "TERRIBLE"]).optional(),
  wheelCategoryOverride: z.enum(["CORE", "MAD_MONEY", "FREE_CAPITAL", "RISK_MGMT"]).optional(),
});

// ─── Research Idea ──────────────────────────────────────────
export const researchIdeaSchema = z.object({
  underlyingId: z.string(),
  strategyType: z.enum([
    "COVERED_CALL",
    "SHORT_PUT",
    "BULL_PUT_SPREAD",
    "BEAR_CALL_SPREAD",
    "IRON_CONDOR",
    "SHORT_STRANGLE",
    "TIME_SPREAD",
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
  wheelCategoryOverride: z.enum(["CORE", "MAD_MONEY", "FREE_CAPITAL", "RISK_MGMT"]).optional(),
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
