import { describe, expect, it } from "vitest";
import { amortize, consolidate, loanPayment, payoffOrder, simulatePayoff, type PayoffDebt } from "../calc";

const debts: PayoffDebt[] = [
  { id: "card", lender: "Card", balance: 6000, apr: 24, payment: 150 },
  { id: "store", lender: "Store card", balance: 900, apr: 18, payment: 35 },
  { id: "car", lender: "Car", balance: 15000, apr: 7, payment: 400 },
];
const today = "2026-10-06";

describe("payoffOrder", () => {
  it("snowball pays the smallest balance first", () => {
    expect(payoffOrder(debts, "snowball").map((d) => d.id)).toEqual(["store", "card", "car"]);
  });
  it("avalanche pays the highest rate first", () => {
    expect(payoffOrder(debts, "avalanche").map((d) => d.id)).toEqual(["card", "store", "car"]);
  });
  it("custom follows the given order", () => {
    expect(payoffOrder(debts, "custom", ["car", "store", "card"]).map((d) => d.id)).toEqual(["car", "store", "card"]);
  });
});

describe("simulatePayoff", () => {
  it("matches simple amortization for a single debt", () => {
    const one = [{ id: "x", lender: "X", balance: 10_000, apr: 6, payment: 304.22 }];
    const r = simulatePayoff(one, { strategy: "avalanche", extra: 0, today });
    expect(r.months).toBe(amortize(10_000, 6, 304.22).months);
    expect(r.totalInterest!).toBeCloseTo(amortize(10_000, 6, 304.22).totalInterest!, 0);
  });

  it("rolling freed payments forward finishes sooner and costs less than just paying minimums", () => {
    const minimums = simulatePayoff(debts, { strategy: "snowball", extra: 0, today, rollover: false });
    const snowball = simulatePayoff(debts, { strategy: "snowball", extra: 0, today });
    expect(snowball.months!).toBeLessThan(minimums.months!);
    expect(snowball.totalInterest!).toBeLessThan(minimums.totalInterest!);
  });

  it("avalanche never costs more interest than snowball", () => {
    const opts = { extra: 200, today };
    const a = simulatePayoff(debts, { ...opts, strategy: "avalanche" });
    const s = simulatePayoff(debts, { ...opts, strategy: "snowball" });
    expect(a.totalInterest!).toBeLessThanOrEqual(s.totalInterest!);
  });

  it("an extra payment shortens the timeline", () => {
    const base = simulatePayoff(debts, { strategy: "avalanche", extra: 0, today });
    const extra = simulatePayoff(debts, { strategy: "avalanche", extra: 300, today });
    expect(extra.months!).toBeLessThan(base.months!);
  });

  it("snowball pays off the smallest debt first", () => {
    const r = simulatePayoff(debts, { strategy: "snowball", extra: 100, today });
    expect(r.order[0].id).toBe("store");
    expect(r.timeline[0]).toBe(21_900);
    expect(r.timeline.at(-1)).toBe(0);
  });

  it("minimums only matches each debt paid on its own", () => {
    const r = simulatePayoff(debts, { strategy: "avalanche", extra: 0, today, rollover: false });
    for (const d of debts) {
      expect(r.order.find((o) => o.id === d.id)!.month).toBe(amortize(d.balance, d.apr, d.payment).months);
    }
  });

  it("reports never when payments don't cover interest", () => {
    const stuck = [{ id: "s", lender: "S", balance: 5000, apr: 30, payment: 100 }];
    const r = simulatePayoff(stuck, { strategy: "avalanche", extra: 0, today });
    expect(r.months).toBeNull();
    expect(r.totalInterest).toBeNull();
  });
});

describe("consolidate", () => {
  it("computes the standard loan payment", () => {
    expect(loanPayment(10_000, 6, 36)).toBeCloseTo(304.22, 2);
    expect(loanPayment(1200, 0, 12)).toBe(100);
  });

  it("saves money when a lower rate replaces high-rate cards", () => {
    const cards = debts.filter((d) => d.id !== "car");
    const r = consolidate(cards, { apr: 9, months: 36, fee: 0 });
    expect(r.savings!).toBeGreaterThan(0);
    expect(r.breakEvenMonth).toBe(1);
  });

  it("can cost more when the term is long and there's a fee", () => {
    const car = debts.filter((d) => d.id === "car");
    const r = consolidate(car, { apr: 6.5, months: 84, fee: 600 });
    expect(r.savings!).toBeLessThan(0);
    expect(r.monthlyPaymentChange).toBeLessThan(0); // lower payment, but more total cost
  });
});

import { businessPnl, monthRange, summarize } from "../calc";

describe("businessPnl", () => {
  const months = monthRange("2026-09", 3);
  const revenue = [
    { month: "2026-07", revenue: 20_000 },
    { month: "2026-08", revenue: 22_000 },
    { month: "2026-09", revenue: 24_000 },
  ];
  const expenses = [
    ...months.map((m, i) => ({ id: `p${i}`, month: m, name: "Payroll", category: "PAYROLL", amount: 8000, oneTime: false })),
    ...months.map((m, i) => ({ id: `s${i}`, month: m, name: "Software", category: "SOFTWARE", amount: 500, oneTime: false })),
    { id: "laptop", month: "2026-08", name: "New laptop", category: "OTHER", amount: 2400, oneTime: true },
  ];

  it("builds three months side by side with an average and one-time items separated", () => {
    expect(months).toEqual(["2026-07", "2026-08", "2026-09"]);
    const p = businessPnl(months, revenue, expenses);
    expect(p.categories).toEqual(["PAYROLL", "SOFTWARE"]);
    expect(p.columns[1]).toMatchObject({ recurringExpenses: 8500, oneTimeExpenses: 2400, netOperatingIncome: 11_100, recurringNet: 13_500 });
    expect(p.average.recurringNet).toBe(13_500);
    expect(p.oneTimeItems.map((e) => e.id)).toEqual(["laptop"]);
    expect(p.suggestedValue).toBe(13_500 * 12 * 2);
  });

  it("bases the tax reserve on P&L net income when it's entered", () => {
    const s = summarize({
      profileType: "BUSINESS_OWNER",
      today: "2026-10-06",
      incomes: [{ id: "d", name: "Draw", type: "OWNER_DRAW", amount: 6000, netAmount: null, frequency: "MONTHLY", active: true }],
      bills: [],
      debts: [],
      assets: [],
      businessNetMonthly: 13_500,
    });
    expect(s.cashFlow.taxReserve).toBe(3375);
    expect(s.cashFlow.taxReserveBasis).toBe("pnl");
  });
});

import { mortgagePiti } from "../calc";

describe("mortgagePiti", () => {
  it("adds taxes, insurance and PMI under 20% down", () => {
    const m = mortgagePiti({ price: 400_000, downPayment: 40_000, apr: 6.5, termYears: 30, propertyTaxPct: 1.2, insuranceAnnual: 1800, pmiPct: 0.5 });
    expect(m.loan).toBe(360_000);
    expect(m.principalInterest).toBeCloseTo(2275.44, 1);
    expect(m.taxes).toBe(400);
    expect(m.insurance).toBe(150);
    expect(m.pmi).toBe(150);
    expect(m.piti).toBeCloseTo(2975.44, 1);
  });

  it("drops PMI at 20% down", () => {
    expect(mortgagePiti({ price: 400_000, downPayment: 80_000, apr: 6.5, termYears: 30, propertyTaxPct: 1.2, insuranceAnnual: 1800, pmiPct: 0.5 }).pmi).toBe(0);
  });
});
