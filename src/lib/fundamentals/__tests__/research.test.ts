import { describe, expect, it } from "vitest";
import { cagr, runDcf, sensitivityGrid, suggestAssumptions } from "../dcf";
import { DEFAULT_PROFILE, evaluateCriteria, metricValuesFromSnapshot, normalizeProfile } from "../criteria";

const base = {
  baseFcf: 100,
  growthRate: 10,
  highGrowthYears: 5,
  terminalGrowth: 2,
  discountRate: 10,
  exitMultiple: null,
  cash: 0,
  debt: 0,
  sharesOutstanding: 10,
  price: null,
};

describe("runDcf", () => {
  it("matches a hand calculation for flat growth", () => {
    // 0% growth everywhere, r = 10%, g = 0%: value = FCF / r = 1000 → 100/share
    const r = runDcf({ ...base, growthRate: 0, terminalGrowth: 0 });
    expect(r.equityValue).toBeCloseTo(1000, 6);
    expect(r.intrinsicPerShare).toBeCloseTo(100, 6);
  });

  it("fades growth linearly to terminal after the high-growth years", () => {
    const r = runDcf(base);
    expect(r.years[4].growth).toBeCloseTo(10);
    expect(r.years[9].growth).toBeCloseTo(2);
    expect(r.years[7].growth).toBeCloseTo(10 + (2 - 10) * (3 / 5));
  });

  it("adds cash, subtracts debt, and computes margin of safety", () => {
    const r = runDcf({ ...base, growthRate: 0, terminalGrowth: 0, cash: 200, debt: 100, price: 88 });
    expect(r.intrinsicPerShare).toBeCloseTo(110, 6);
    expect(r.marginOfSafety).toBeCloseTo(20, 6);
  });

  it("rejects terminal growth at or above the discount rate", () => {
    expect(() => runDcf({ ...base, terminalGrowth: 10 })).toThrow();
  });

  it("supports an exit multiple", () => {
    const r = runDcf({ ...base, growthRate: 0, terminalGrowth: 0, exitMultiple: 10 });
    // PV of 10 years of 100 at 10% = 614.46; terminal 1000 discounted 10y = 385.54
    expect(r.equityValue).toBeCloseTo(1000, 1);
  });

  it("builds a sensitivity grid with higher value at lower discount rates", () => {
    const g = sensitivityGrid(base);
    expect(g.values.length).toBe(5);
    expect(g.values[0][2]!).toBeGreaterThan(g.values[4][2]!);
  });
});

describe("suggestAssumptions", () => {
  it("uses history CAGR, clamped, and the recent FCF average", () => {
    const history = [2021, 2022, 2023, 2024].map((year, i) => ({
      year,
      freeCashFlow: 100 * Math.pow(1.08, i),
      operatingCashFlow: null,
      capitalExpenditure: null,
      revenue: null,
      netIncome: null,
      dilutedEps: null,
      shares: 50,
      totalDebt: 20,
      cash: 30,
    }));
    const a = suggestAssumptions(history, 40)!;
    expect(a.growthRate).toBe(8);
    expect(a.sharesOutstanding).toBe(50);
    expect(a.price).toBe(40);
    expect(cagr([100, 121])).toBeCloseTo(21);
  });
});

describe("evaluateCriteria", () => {
  it("scores lower-is-better and higher-is-better metrics", () => {
    const e = evaluateCriteria({ trailingPe: 12, pegRatio: 1.8, returnOnEquity: 22, fcfYield: 4 });
    const s = Object.fromEntries(e.rows.map((r) => [r.key, r.status]));
    expect(s.trailingPe).toBe("green");
    expect(s.pegRatio).toBe("red");
    expect(s.returnOnEquity).toBe("green");
    expect(s.fcfYield).toBe("yellow");
    expect(s.priceToBook).toBe("gray");
  });

  it("flags value traps", () => {
    const row = evaluateCriteria({ trailingPe: 5 }).rows.find((r) => r.key === "trailingPe")!;
    expect(row.status).toBe("yellow");
    expect(row.warning).toMatch(/distress/);
  });

  it("fails when a required criterion is not green", () => {
    const profile = {
      ...DEFAULT_PROFILE,
      criteria: DEFAULT_PROFILE.criteria.map((c) => (c.key === "pegRatio" ? { ...c, required: true } : c)),
    };
    const e = evaluateCriteria({ trailingPe: 10, pegRatio: 1.2, returnOnEquity: 30 }, profile);
    expect(e.failedRequired).toEqual(["pegRatio"]);
    expect(e.verdict).toBe("FAIL");
  });

  it("normalizes Yahoo units (D/E percent, ROE decimal)", () => {
    const v = metricValuesFromSnapshot({ debtToEquity: 33.5, returnOnEquity: 0.31, profitMargins: 0.36 });
    expect(v.debtToEquity).toBeCloseTo(0.335);
    expect(v.returnOnEquity).toBeCloseTo(31);
    expect(v.profitMargin).toBeCloseTo(36);
  });

  it("corrects currency-mixed ratios for foreign filers (statements in CNY, price in USD)", () => {
    // ZTO, Oct 2026: Yahoo's EV ($5.8B) mixes a USD market cap with CNY debt and cash.
    const raw = {
      financialData: {
        freeCashflow: 4_000_000_000,
        ebitda: 14_943_898_624,
        totalCash: 31_307_786_240,
        totalDebt: 22_039_842_816,
      },
      summaryDetail: { marketCap: 18_000_000_000 },
    };
    const v = metricValuesFromSnapshot({ enterpriseToEbitda: 0.388, priceToSales: 0.37, raw }, { fx: 0.149 });
    // (18e9 + (22.04e9 − 31.31e9) × 0.149) / (14.94e9 × 0.149)
    expect(v.enterpriseToEbitda).toBeCloseTo(7.46, 2);
    expect(v.priceToSales).toBeCloseTo(2.48, 2);
    expect(v.fcfYield).toBeCloseTo(3.31, 2);
    const unknown = metricValuesFromSnapshot({ enterpriseToEbitda: 0.37, raw }, { fx: null });
    expect(unknown.enterpriseToEbitda).toBeNull();
    expect(unknown.fcfYield).toBeNull();
  });

  it("fills in new catalog metrics on stored profiles", () => {
    const p = normalizeProfile({ passScore: 70, criteria: [{ key: "trailingPe", enabled: true, good: 12, ok: 18, weight: 3 }] });
    expect(p.passScore).toBe(70);
    expect(p.criteria.find((c) => c.key === "trailingPe")!.good).toBe(12);
    expect(p.criteria.length).toBe(DEFAULT_PROFILE.criteria.length);
  });
});
