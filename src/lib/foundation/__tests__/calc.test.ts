import { describe, expect, it } from "vitest";
import {
  amortize,
  analyzeDebt,
  dtiBand,
  estimatedBalance,
  monthly,
  monthsBetween,
  summarize,
  type DebtInput,
} from "../calc";

const debt = (over: Partial<DebtInput> = {}): DebtInput => ({
  id: "d1",
  lender: "Bank",
  type: "AUTO",
  balance: 10_000,
  balanceAsOf: "2026-10-01",
  monthlyPayment: 300,
  apr: 6,
  aprIsEstimate: false,
  creditLimit: null,
  escrowTaxes: null,
  escrowInsurance: null,
  pmi: null,
  paidOffAt: null,
  ...over,
});

describe("monthly", () => {
  it("converts pay frequencies to a monthly average", () => {
    expect(monthly(1000, "MONTHLY")).toBe(1000);
    expect(monthly(2000, "BIWEEKLY")).toBeCloseTo(4333.33, 2);
    expect(monthly(300, "QUARTERLY")).toBe(100);
    expect(monthly(1200, "ANNUAL")).toBe(100);
  });
});

describe("amortize", () => {
  it("matches a standard amortization table", () => {
    // $10,000 at 6% for 36 months has a payment of $304.22 and $951.92 of interest.
    const a = amortize(10_000, 6, 304.22);
    expect(a.months).toBe(36);
    expect(a.totalInterest!).toBeCloseTo(951.9, 0);
  });

  it("flags a payment that doesn't cover interest", () => {
    // $5,000 at 24% is $100/month of interest.
    const a = amortize(5000, 24, 90);
    expect(a.months).toBeNull();
    expect(a.firstYearInterest).toBe(1200);
  });

  it("handles 0% debt", () => {
    expect(amortize(1200, 0, 100)).toMatchObject({ months: 12, totalInterest: 0 });
  });
});

describe("estimatedBalance", () => {
  it("assumes the standard payment was made since the balance was verified", () => {
    const d = debt({ balance: 1000, apr: 12, monthlyPayment: 110, balanceAsOf: "2026-08-01" });
    // Aug→Oct = 2 months: 1000*1.01-110 = 900; 900*1.01-110 = 799
    expect(estimatedBalance(d, "2026-10-06")).toEqual({ balance: 799, estimated: true });
  });

  it("uses the verified balance in the same month", () => {
    expect(estimatedBalance(debt(), "2026-10-20")).toEqual({ balance: 10_000, estimated: false });
  });

  it("counts whole months", () => {
    expect(monthsBetween("2026-08-15", "2026-10-14")).toBe(1);
    expect(monthsBetween("2026-08-15", "2026-10-15")).toBe(2);
  });
});

describe("analyzeDebt", () => {
  it("includes escrow in a mortgage's payment but amortizes principal & interest only", () => {
    const m = analyzeDebt(
      debt({ type: "MORTGAGE", balance: 200_000, apr: 6, monthlyPayment: 1199.1, escrowTaxes: 300, escrowInsurance: 100, pmi: 50 }),
      "2026-10-06"
    );
    expect(m.payment).toBeCloseTo(1649.1, 2);
    expect(m.monthlyInterest).toBe(1000);
    expect(m.payoffMonths).toBe(360);
  });

  it("leaves interest blank when the APR is missing", () => {
    const a = analyzeDebt(debt({ apr: null }), "2026-10-06");
    expect(a.monthlyInterest).toBeNull();
    expect(a.notPayingDown).toBe(false);
  });
});

describe("dtiBand", () => {
  it("bands debt-to-income", () => {
    expect(dtiBand(0.3)).toBe("excellent");
    expect(dtiBand(0.4)).toBe("good");
    expect(dtiBand(0.5)).toBe("elevated");
    expect(dtiBand(0.55)).toBe("high");
  });
});

describe("summarize", () => {
  const base = {
    profileType: "EMPLOYEE" as const,
    today: "2026-10-06",
    incomes: [
      { id: "i1", name: "Job", type: "SALARY" as const, amount: 8000, netAmount: 6000, frequency: "MONTHLY" as const, active: true },
    ],
    bills: [
      { id: "b1", name: "Electric", category: "UTILITIES", amount: 150, frequency: "MONTHLY" as const },
      { id: "b2", name: "Water", category: "UTILITIES", amount: 180, frequency: "QUARTERLY" as const },
    ],
    debts: [
      debt({ id: "car", type: "AUTO", balance: 12_000, monthlyPayment: 400, apr: 6 }),
      debt({ id: "card", type: "CREDIT_CARD", balance: 3000, monthlyPayment: 100, apr: 24, creditLimit: 10_000 }),
    ],
    assets: [
      { id: "a1", name: "Checking", type: "CHECKING" as const, value: 2000, valueIsEstimate: false, securesDebtId: null },
      { id: "a2", name: "Car", type: "VEHICLE" as const, value: 15_000, valueIsEstimate: true, securesDebtId: "car" },
      { id: "a3", name: "401k", type: "RETIREMENT" as const, value: 40_000, valueIsEstimate: false, securesDebtId: null },
    ],
  };

  it("builds cash flow, interest, DTI, net worth and the emergency fund gap", () => {
    const s = summarize(base);
    expect(s.bills.monthly).toBe(210); // 150 + 180/3
    expect(s.debt.paymentsMonthly).toBe(500);
    expect(s.cashFlow.monthly).toBe(5290); // 6000 - 210 - 500
    expect(s.debt.interestMonthly).toBe(120); // 12000*0.5% + 3000*2%
    expect(s.dti).toEqual({ value: 500 / 8000, band: "excellent" });
    expect(s.netWorth).toBe(57_000 - 15_000);
    expect(s.assets.liquid).toBe(2000);
    expect(s.assets.equity[0]).toMatchObject({ equity: 3000 });
    expect(s.debt.utilization).toBeCloseTo(0.3);
    expect(s.emergencyFund.target).toBe(2130); // 3 × (210 + 500)
    expect(s.emergencyFund.gap).toBe(130);
    expect(s.emergencyFund.monthsToGoal).toBe(1);
    expect(s.cashFlow.taxReserve).toBe(0);
  });

  it("reserves 25% of business income for business owners", () => {
    const s = summarize({
      ...base,
      profileType: "BUSINESS_OWNER",
      incomes: [{ id: "i2", name: "Draw", type: "OWNER_DRAW", amount: 10_000, netAmount: null, frequency: "MONTHLY", active: true }],
    });
    expect(s.cashFlow.taxReserve).toBe(2500);
    expect(s.income.missingTakeHome).toBe(false);
  });

  it("drops paid-off debts from every total", () => {
    const s = summarize({ ...base, debts: [debt({ id: "car", paidOffAt: "2026-09-01T00:00:00Z" })] });
    expect(s.debt.total).toBe(0);
    expect(s.debt.paymentsMonthly).toBe(0);
  });
});
