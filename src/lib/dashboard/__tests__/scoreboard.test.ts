import { describe, expect, it } from "vitest";
import { investingYear } from "../investing";
import { scoreboard } from "../scoreboard";

const today = "2026-10-06";
const ledger = [
  { accountId: "a", type: "PREMIUM_CREDIT", amount: 400, occurredAt: "2026-08-10T15:00:00Z", strategyType: "SHORT_PUT", description: null },
  { accountId: "a", type: "PREMIUM_CREDIT", amount: 600, occurredAt: "2026-09-10T15:00:00Z", strategyType: "SHORT_PUT", description: null },
  { accountId: "a", type: "PREMIUM_CREDIT", amount: 150, occurredAt: "2026-10-02T15:00:00Z", strategyType: "SHORT_PUT", description: null },
];
const year = investingYear({ year: 2026, today, ledger, lots: [], dividendHoldings: [] });
const base = {
  today,
  year,
  personalMonthly: 1000,
  netWorth: 52_000,
  history: [
    { month: "2026-08", netWorth: 48_000, liabilities: 20_000 },
    { month: "2026-09", netWorth: 50_000, liabilities: 19_400 },
    { month: "2026-10", netWorth: 52_000, liabilities: 19_000 },
  ],
  capital: [{ key: "p", openedAt: "2026-07-01T00:00:00Z", closedAt: null, bpe: 10_000, estimated: false }],
  debts: [{ balance: 19_000, apr: 12, payment: 600 }],
};

describe("scoreboard", () => {
  const { stats, winning, scored } = scoreboard(base);
  const get = (k: string) => stats.find((s) => s.key === k)!;

  it("judges cash flow on the last full month vs the month before", () => {
    expect(get("cashFlow")).toMatchObject({ value: 1600, previous: 1400, change: 200, winning: true, period: "September" });
  });

  it("compares net worth now with the end of last month", () => {
    expect(get("netWorth")).toMatchObject({ value: 52_000, previous: 50_000, winning: true });
  });

  it("computes ROI on average buying power used", () => {
    expect(get("roi").value).toBeCloseTo(0.06); // 600 / 10,000
    expect(get("roi").previous).toBeCloseTo(0.04);
    expect(get("roi").winning).toBe(true);
  });

  it("measures debt reduction from month-end balances", () => {
    expect(get("debtReduction")).toMatchObject({ value: 600, previous: null, period: "September" });
  });

  it("calls interest a win when it's lower than last month", () => {
    const i = get("interest");
    expect(i.value).toBeCloseTo(190); // 19,000 × 1%
    expect(i.previous!).toBeGreaterThan(i.value!);
    expect(i.winning).toBe(true);
    expect(i.series[0]).toBe(190);
    expect(i.series[11]).toBeLessThan(190);
  });

  it("counts wins only where there's something to compare", () => {
    expect(scored).toBe(4); // stock gained 0 vs 0 counts; debt reduction has no prior month
    expect(winning).toBeGreaterThanOrEqual(4);
  });
});
