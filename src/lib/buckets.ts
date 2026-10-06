import { z } from "zod";

/**
 * The three money buckets every trade belongs to.
 * Single source of truth for labels, colors and validation.
 */
export const BUCKETS = ["CORE", "SPECULATION", "RISK_FREE_MONEY"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const bucketSchema = z.enum(BUCKETS);

export const BUCKET_LABELS: Record<Bucket, string> = {
  CORE: "Core Investments",
  SPECULATION: "Speculation",
  RISK_FREE_MONEY: "Risk Mgmt / Free Money",
};

export const BUCKET_SHORT_LABELS: Record<Bucket, string> = {
  CORE: "Core",
  SPECULATION: "Speculation",
  RISK_FREE_MONEY: "Free Money",
};

/** Hex colors, kept in sync with the --color-* tokens in globals.css. */
export const BUCKET_COLORS: Record<Bucket, string> = {
  CORE: "#6366f1",
  SPECULATION: "#f59e0b",
  RISK_FREE_MONEY: "#22c55e",
};

export const BUCKET_OPTIONS = BUCKETS.map((value) => ({ value, label: BUCKET_LABELS[value] }));

export const DEFAULT_BUCKET_TARGETS: { category: Bucket; targetPct: number }[] = [
  { category: "CORE", targetPct: 50 },
  { category: "SPECULATION", targetPct: 20 },
  { category: "RISK_FREE_MONEY", targetPct: 30 },
];

/** Bucket used when nothing else classifies a trade. */
export const DEFAULT_BUCKET: Bucket = "SPECULATION";

export const CORE_PLAN_MODES = ["ACCUMULATE", "REDUCE_BASIS", "INCOME"] as const;
export type CorePlanModeValue = (typeof CORE_PLAN_MODES)[number];

export const CORE_PLAN_LABELS: Record<CorePlanModeValue, { label: string; description: string }> = {
  ACCUMULATE: {
    label: "Accumulate shares",
    description: "Premium collects in this stock's bucket and is reinvested to buy more shares.",
  },
  REDUCE_BASIS: {
    label: "Lower cost basis",
    description: "Premium is applied to reduce the cost basis of the shares you hold.",
  },
  INCOME: {
    label: "Cash flow",
    description: "Premium is taken as income into Free Money.",
  },
};
