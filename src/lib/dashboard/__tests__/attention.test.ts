import { describe, expect, it } from "vitest";
import { summarize, type DebtInput } from "@/lib/foundation/calc";
import { attentionItems } from "../attention";

const debt = (over: Partial<DebtInput>): DebtInput => ({
  id: "d",
  lender: "Bank",
  type: "CREDIT_CARD",
  balance: 1000,
  balanceAsOf: "2026-10-01",
  monthlyPayment: 100,
  apr: 20,
  aprIsEstimate: false,
  creditLimit: 10_000,
  escrowTaxes: null,
  escrowInsurance: null,
  pmi: null,
  paidOffAt: null,
  ...over,
});

const today = "2026-10-06";
const foundation = (debts: DebtInput[], netAmount = 5000, bills = 1000) =>
  summarize({
    profileType: "EMPLOYEE",
    today,
    incomes: [{ id: "i", name: "Job", type: "SALARY", amount: 6000, netAmount, frequency: "MONTHLY", active: true }],
    bills: [{ id: "b", name: "Rent", category: "HOUSING", amount: bills, frequency: "MONTHLY" }],
    debts,
    assets: [{ id: "c", name: "Checking", type: "CHECKING", value: 50_000, valueIsEstimate: false, securesDebtId: null }],
  });

describe("attentionItems", () => {
  it("is all clear when nothing applies", () => {
    expect(attentionItems({ today, foundation: foundation([debt({})]), debts: [{ lender: "Bank", balanceAsOf: today, paidOffAt: null }], holdings: [], events: [] })).toEqual([]);
  });

  it("ranks danger, then warning, then info, and caps at 5", () => {
    const debts = [
      debt({ id: "stuck1", lender: "Chase", balance: 6000, apr: 30, monthlyPayment: 100, creditLimit: 7000 }),
      debt({ id: "stuck2", lender: "Citi", balance: 5000, apr: 30, monthlyPayment: 90, creditLimit: 6000 }),
    ];
    const items = attentionItems({
      today,
      foundation: foundation(debts, 1000, 2000), // overspending too
      debts: [{ lender: "Chase", balanceAsOf: "2026-07-01", paidOffAt: null }],
      holdings: [
        { symbol: "PEP", accountId: "a", unrealizedPct: -18, dayPct: -0.5 },
        { symbol: "XYZ", accountId: "a", unrealizedPct: 2, dayPct: -4 },
        { symbol: "KO", accountId: "a", unrealizedPct: 5, dayPct: 0.3 },
      ],
      events: [{ date: "2026-10-07", label: "CPI m/m", time: "8:30 AM", kind: "release", high: true, forecast: "0.3%", previous: "0.4%" }],
    });
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.severity)).toEqual(["danger", "danger", "danger", "warning", "warning"]);
    expect(items[0].key).toBe("overspending");
    expect(items[3].message).toBe("2 positions need attention: PEP, XYZ");
  });

  it("raises high-impact releases today or tomorrow with the expected value", () => {
    const items = attentionItems({
      today,
      foundation: null,
      debts: [],
      holdings: [],
      events: [
        { date: "2026-10-07", label: "CPI m/m", time: "8:30 AM", kind: "release", high: true, forecast: "0.3%", previous: "0.4%" },
        { date: "2026-10-07", label: "Prelim UoM Consumer Sentiment", time: "10:00 AM", kind: "release", high: false, forecast: "47.5" },
        { date: "2026-10-09", label: "PPI m/m", time: "8:30 AM", kind: "release", high: true },
      ],
    });
    expect(items.map((i) => i.message)).toEqual(["CPI m/m tomorrow 8:30 AM ET · exp 0.3%"]);
  });

  it("flags stale balances and the emergency fund gap", () => {
    const f = summarize({
      profileType: "EMPLOYEE",
      today,
      incomes: [{ id: "i", name: "Job", type: "SALARY", amount: 6000, netAmount: 5000, frequency: "MONTHLY", active: true }],
      bills: [{ id: "b", name: "Rent", category: "HOUSING", amount: 2000, frequency: "MONTHLY" }],
      debts: [],
      assets: [{ id: "c", name: "Checking", type: "CHECKING", value: 1000, valueIsEstimate: false, securesDebtId: null }],
    });
    const items = attentionItems({ today, foundation: f, debts: [{ lender: "Car", balanceAsOf: "2026-08-01", paidOffAt: null }], holdings: [], events: [] });
    expect(items.map((i) => i.key)).toEqual(["stale", "emergency"]);
    expect(items[1].message).toBe("Emergency fund is $5,000 short, about 2 months at your surplus");
  });
});
