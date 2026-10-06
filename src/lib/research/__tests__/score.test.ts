import { describe, expect, it } from "vitest";
import { evaluateCriteria, type CriteriaProfile } from "@/lib/fundamentals/criteria";
import type { AnnualFacts } from "@/lib/sec/xbrl";
import { LENSES } from "../lenses";
import { computeScore, LENS_WEIGHTS, scale, weightsForLens, type ScoreInput } from "../score";

/** Ten steady years: revenue +10%/yr, 20% ROIC, net cash. */
const steadyYears = (over: Partial<AnnualFacts> = {}): AnnualFacts[] =>
  Array.from({ length: 10 }, (_, i) => ({
    fiscalYear: 2016 + i,
    periodEnd: `${2016 + i}-12-31`,
    revenue: 100 * 1.1 ** i,
    operatingIncome: 20 * 1.1 ** i,
    operatingMargin: 20,
    netIncome: 15 * 1.1 ** i,
    dilutedEps: 1.5 * 1.1 ** i,
    freeCashFlow: 14 * 1.1 ** i,
    equity: 80 * 1.08 ** i,
    totalDebt: 10,
    cash: 30,
    roe: 18,
    roic: 20,
    ...over,
  }));

const profile: CriteriaProfile = LENSES.buffett.criteria;
const cheap = { trailingPe: 12, forwardPe: 11, priceToBook: 2, fcfYield: 7, returnOnEquity: 22, profitMargin: 18, debtToEquity: 0.2 };

const base = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  weights: LENS_WEIGHTS.buffett,
  financialKind: null,
  metrics: cheap,
  criteria: evaluateCriteria(cheap, profile),
  years: steadyYears(),
  dcf: { marginOfSafety: 30, terminalShare: 55 },
  report: { moat: "WIDE", risks: [{ severity: "medium", trend: "stable" }] },
  momentum: null,
  ...over,
});

describe("scale", () => {
  it("maps linearly in either direction and clamps", () => {
    expect(scale(10, 0, 20)).toBe(50);
    expect(scale(30, 0, 20)).toBe(100);
    expect(scale(0.2, 2, 0.2)).toBe(100); // lower is better
    expect(scale(null, 0, 1)).toBeNull();
  });
});

describe("lens weights", () => {
  it.each(Object.entries(LENS_WEIGHTS))("%s sums to 100", (_, w) => {
    expect(Object.values(w).reduce((s, v) => s + v, 0)).toBe(100);
  });
  it("strategies inherit their base lens weights", () => {
    expect(weightsForLens("strategy:abc", "lynch")).toBe(LENS_WEIGHTS.lynch);
    expect(weightsForLens("strategy:abc", null)).toBe(LENS_WEIGHTS.general);
  });
});

describe("computeScore", () => {
  it("rates a steady, cheap, wide-moat compounder highly with high confidence", () => {
    const r = computeScore(base());
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.confidence).toBe("HIGH");
    expect(r.caps).toEqual([]);
    expect(r.pillars.map((p) => p.key)).toEqual(["quality", "growth", "strength", "valuation", "moat"]);
  });

  it("caps the score when a must-have rule fails", () => {
    const weakRoe = { ...cheap, returnOnEquity: 8 };
    const r = computeScore(base({ metrics: weakRoe, criteria: evaluateCriteria(weakRoe, profile) }));
    expect(r.score).toBeLessThanOrEqual(49);
    expect(r.caps[0]).toMatch(/must-have rule: Return on equity/);
  });

  it("caps a company that lost money last year", () => {
    const years = steadyYears();
    years[9] = { ...years[9], netIncome: -5 };
    expect(computeScore(base({ years })).score).toBeLessThanOrEqual(45);
  });

  it("counts a DCF less when most of its value is terminal", () => {
    const solid = computeScore(base({ dcf: { marginOfSafety: -30, terminalShare: 50 } }));
    const shaky = computeScore(base({ dcf: { marginOfSafety: -30, terminalShare: 85 } }));
    const v = (r: typeof solid) => r.pillars.find((p) => p.key === "valuation")!.score!;
    expect(v(shaky)).toBeGreaterThan(v(solid));
  });

  it("values insurers on price-to-book vs ROE instead of the DCF", () => {
    const r = computeScore(base({ financialKind: "insurer", metrics: { ...cheap, priceToBook: 1.2 } }));
    const valuation = r.pillars.find((p) => p.key === "valuation")!;
    expect(valuation.notes.join(" ")).toMatch(/P\/B 1\.20 vs ROE/);
    expect(valuation.notes.join(" ")).toMatch(/DCF not used: insurer/);
  });

  it("drops confidence without a report, and quick scores are always low confidence", () => {
    expect(computeScore(base({ report: null })).confidence).toBe("MEDIUM");
    expect(computeScore(base({ years: null, dcf: null, report: null, quick: true })).confidence).toBe("LOW");
  });

  it("adds a momentum pillar only for lenses that weight it", () => {
    const r = computeScore(
      base({ weights: LENS_WEIGHTS.druckenmiller, momentum: { aboveSma200: true, change12mPct: 30, revisionsUp30d: 8, revisionsDown30d: 1 } })
    );
    expect(r.pillars.find((p) => p.key === "momentum")?.score).toBe(100);
    expect(computeScore(base()).pillars.some((p) => p.key === "momentum")).toBe(false);
  });
});
