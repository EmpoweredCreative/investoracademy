import { describe, expect, it } from "vitest";
import { averageCapital, capitalItems, estimateBpe, monthlyRoi, type OptionPosition } from "../capital";

const leg = (over: Partial<OptionPosition>): OptionPosition => ({
  id: "l",
  groupId: null,
  strategyType: null,
  callPut: "PUT",
  longShort: "SHORT",
  strike: 50,
  quantity: 1,
  openedAt: "2026-09-01T15:00:00Z",
  closedAt: null,
  bpe: null,
  premium: 120,
  ...over,
});

describe("estimateBpe", () => {
  it("uses ~20% of the strike for a naked short put", () => {
    expect(estimateBpe([leg({ strategyType: "SHORT_PUT", strike: 50, quantity: 2 })])).toBe(2000);
  });

  it("uses width × 100 − credit for a put credit spread", () => {
    const legs = [
      leg({ id: "s", groupId: "g", strategyType: "BULL_PUT_SPREAD", strike: 100, premium: 180 }),
      leg({ id: "l", groupId: "g", strategyType: "BULL_PUT_SPREAD", longShort: "LONG", strike: 95, premium: -60 }),
    ];
    expect(estimateBpe(legs)).toBe(500 - 120);
  });

  it("uses the wider side for an iron condor", () => {
    const legs = [
      leg({ id: "a", strike: 100, premium: 100 }),
      leg({ id: "b", strike: 95, longShort: "LONG", premium: -40 }),
      leg({ id: "c", callPut: "CALL", strike: 110, premium: 90 }),
      leg({ id: "d", callPut: "CALL", strike: 120, longShort: "LONG", premium: -30 }),
    ];
    expect(estimateBpe(legs)).toBe(1000 - 120);
  });

  it("covered calls add nothing; long options use the premium paid", () => {
    expect(estimateBpe([leg({ strategyType: "COVERED_CALL", callPut: "CALL" })])).toBe(0);
    expect(estimateBpe([leg({ strategyType: "LEAP_CALL", longShort: "LONG", premium: -1500 })])).toBe(1500);
  });
});

describe("capitalItems", () => {
  it("prefers broker or ticket BPE and groups legs", () => {
    const items = capitalItems(
      [
        leg({ id: "s", groupId: "g", bpe: 300 }),
        leg({ id: "l", groupId: "g", longShort: "LONG", strike: 45, bpe: 0, premium: -50 }),
        leg({ id: "p", strategyType: "SHORT_PUT" }),
      ],
      [{ openedAt: "2026-08-01T15:00:00Z", shares: 100, cost: 6000, marginRequirement: null }]
    );
    expect(items.map((i) => [i.bpe, i.estimated])).toEqual([
      [300, false],
      [1000, true],
      [3000, true],
    ]);
  });
});

describe("averageCapital", () => {
  it("time-weights positions over the days they were open", () => {
    // $3,000 open all of September (30 days) + $1,500 open for the last 10 days
    const items = [
      { key: "a", openedAt: "2026-08-20T00:00:00Z", closedAt: null, bpe: 3000, estimated: false },
      { key: "b", openedAt: "2026-09-21T00:00:00Z", closedAt: null, bpe: 1500, estimated: true },
    ];
    const r = averageCapital(items, "2026-09", "2026-10-06");
    expect(r.average).toBe(3000 + (1500 * 10) / 30);
    expect(r.estimatedShare).toBeCloseTo(15000 / (90000 + 15000));
  });

  it("only counts days so far in the current month, and nothing in the future", () => {
    const items = [{ key: "a", openedAt: "2026-09-01T00:00:00Z", closedAt: "2026-10-04T00:00:00Z", bpe: 6000, estimated: false }];
    expect(averageCapital(items, "2026-10", "2026-10-06").average).toBe((6000 * 3) / 6);
    expect(averageCapital(items, "2026-11", "2026-10-06").average).toBe(0);
  });
});

describe("monthlyRoi", () => {
  it("divides income by capital used and annualizes simply", () => {
    expect(monthlyRoi(180, 1400)).toEqual({ roi: 180 / 1400, annualized: (180 / 1400) * 12 });
    expect(monthlyRoi(100, 0)).toBeNull();
  });
});
