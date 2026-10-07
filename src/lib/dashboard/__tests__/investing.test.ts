import { describe, expect, it } from "vitest";
import { investingYear, isPurchasedLot, premiumShare, sourceFor, type LedgerRow, type LotRow } from "../investing";

const L = (over: Partial<LedgerRow>): LedgerRow => ({
  accountId: "a",
  type: "PREMIUM_CREDIT",
  amount: 0,
  occurredAt: "2026-09-10T15:00:00Z",
  strategyType: null,
  description: null,
  ...over,
});

const lot = (over: Partial<LotRow>): LotRow => ({
  accountId: "a",
  symbol: "KO",
  acquiredAt: "2026-09-12T15:00:00Z",
  quantity: 100,
  costBasis: 6000,
  fundedBy: "CASH",
  premiumFundedQty: 0,
  ...over,
});

describe("sourceFor", () => {
  it("groups strategies into cash-flow sources", () => {
    expect(sourceFor("COVERED_CALL")).toBe("COVERED_CALLS");
    expect(sourceFor("SHORT_PUT")).toBe("CASH_SECURED_PUTS");
    expect(sourceFor("BEAR_CALL_SPREAD")).toBe("CREDIT_SPREADS");
    expect(sourceFor("SHORT_STRANGLE")).toBe("CONDORS_STRANGLES");
    expect(sourceFor("LEAP_CALL")).toBe("OTHER_OPTIONS");
    expect(sourceFor(null)).toBe("OTHER_OPTIONS");
  });
});

describe("lots", () => {
  it("counts a lot only when the ledger has a matching buy", () => {
    const buy = L({ type: "STOCK_BUY", amount: 6000, occurredAt: "2026-09-12T16:00:00Z", description: "Bought 100 KO @ 60" });
    expect(isPurchasedLot(lot({}), [buy])).toBe(true);
    expect(isPurchasedLot(lot({ symbol: "PEP" }), [buy])).toBe(false);
    expect(isPurchasedLot(lot({}), [])).toBe(false); // reconcile-created lot
  });

  it("splits cost by how the shares were paid for", () => {
    expect(premiumShare(lot({ fundedBy: "PREMIUM" }))).toBe(1);
    expect(premiumShare(lot({ fundedBy: "MIXED", premiumFundedQty: 25 }))).toBe(0.25);
    expect(premiumShare(lot({ fundedBy: "CASH", premiumFundedQty: 50 }))).toBe(0);
  });
});

describe("investingYear", () => {
  const ledger: LedgerRow[] = [
    // July–September: covered calls 300/mo, CSPs 200/mo, plus one buy-to-close
    ...["07", "08", "09"].flatMap((m) => [
      L({ occurredAt: `2026-${m}-05T15:00:00Z`, amount: 300, strategyType: "COVERED_CALL" }),
      L({ occurredAt: `2026-${m}-06T15:00:00Z`, amount: 200, strategyType: "SHORT_PUT" }),
    ]),
    L({ type: "PREMIUM_DEBIT", occurredAt: "2026-09-20T15:00:00Z", amount: 90, strategyType: "COVERED_CALL" }),
    L({ type: "DIVIDEND", occurredAt: "2026-09-15T15:00:00Z", amount: 45 }),
    L({ type: "INTEREST", occurredAt: "2026-09-30T15:00:00Z", amount: 5 }),
    L({ type: "CASH_DEPOSIT", occurredAt: "2026-09-01T15:00:00Z", amount: 1000 }),
    L({ type: "STOCK_BUY", occurredAt: "2026-09-12T16:00:00Z", amount: 6000, description: "Bought 100 KO @ 60" }),
    // Last year's December counts for nothing this year
    L({ occurredAt: "2025-12-15T15:00:00Z", amount: 999, strategyType: "COVERED_CALL" }),
  ];
  const lots = [lot({ fundedBy: "MIXED", premiumFundedQty: 40 })];
  const holdings = [{ symbol: "KO", shares: 100, annualDividend: 2.04 }];
  const y = investingYear({ year: 2026, today: "2026-10-06", ledger, lots, dividendHoldings: holdings });

  it("buckets actuals by month and source, netting buy-to-close", () => {
    const sep = y.months[8];
    expect(sep.bySource).toMatchObject({ COVERED_CALLS: 210, CASH_SECURED_PUTS: 200, DIVIDENDS: 50 });
    expect(sep.total).toBe(460);
    expect(sep).toMatchObject({ deposits: 1000, stockBought: 6000, projected: false });
    expect(y.months[0].total).toBe(0); // Dec 2025 isn't in 2026
  });

  it("splits shares added into premium-funded and cash", () => {
    expect(y.months[8].shares).toMatchObject({ cost: 6000, premiumCost: 2400, cashCost: 3600 });
    expect(y.months[8].shares.symbols).toEqual([{ symbol: "KO", shares: 100 }]);
    expect(y.shares.premiumPct).toBeCloseTo(0.4);
  });

  it("projects the rest of the year from the 3-month run-rate and holdings dividends", () => {
    expect(y.runRate.COVERED_CALLS).toBe(270); // (300 + 300 + 210) / 3
    expect(y.runRate.CASH_SECURED_PUTS).toBe(200);
    expect(y.runRate.DIVIDENDS).toBe(17); // 100 × $2.04 / 12
    expect(y.dividendBasis).toBe("holdings");
    expect(y.months[9]).toMatchObject({ projected: false, toDate: true }); // October = actual so far
    expect(y.months[10]).toMatchObject({ projected: true, total: 487 });
    expect(y.ytd).toBe(500 + 500 + 460);
    expect(y.projectedYear).toBe(1460 + 487 * 2);
  });

  it("falls back to the dividend average when no rates are known", () => {
    const z = investingYear({ year: 2026, today: "2026-10-06", ledger, lots, dividendHoldings: [] });
    expect(z.dividendBasis).toBe("average");
    expect(z.runRate.DIVIDENDS).toBeCloseTo(16.67, 2);
  });
});
