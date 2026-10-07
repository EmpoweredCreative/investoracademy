import { describe, expect, it } from "vitest";
import { ema, rsi, sma, trendOf } from "../technicals";
import { transform } from "../fred";

const ramp = (n: number, start = 1, step = 1) => Array.from({ length: n }, (_, i) => start + i * step);

describe("moving averages", () => {
  it("sma averages the last n values", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
    expect(sma([1, 2], 3)).toBeNull();
  });

  it("ema of a constant series is the constant", () => {
    expect(ema(Array(30).fill(10), 9)).toBeCloseTo(10);
  });

  it("ema leans toward recent values", () => {
    const values = [...Array(20).fill(10), 20];
    expect(ema(values, 9)!).toBeGreaterThan(sma(values, 9)!);
  });
});

describe("rsi", () => {
  it("is 100 when price only rises and low when it only falls", () => {
    expect(rsi(ramp(30), 14)).toBe(100);
    expect(rsi(ramp(30, 100, -1), 14)).toBeLessThan(1);
  });

  it("needs more than n values", () => {
    expect(rsi(ramp(14), 14)).toBeNull();
  });
});

describe("trendOf", () => {
  it("reads a rising series as bullish and a falling one as bearish", () => {
    expect(trendOf(ramp(40), 20)).toBe("BULLISH");
    expect(trendOf(ramp(40, 100, -1), 20)).toBe("BEARISH");
  });

  it("reads a flat series as neutral", () => {
    expect(trendOf(Array(40).fill(5), 20)).toBe("NEUTRAL");
  });

  it("returns null without enough history", () => {
    expect(trendOf(ramp(10), 20)).toBeNull();
  });
});

describe("fred transform", () => {
  it("computes year-over-year percent change by month", () => {
    const points = [
      { date: "2025-01-01", value: 100 },
      { date: "2025-02-01", value: 100 },
      { date: "2026-01-01", value: 103 },
      { date: "2026-02-01", value: 102.5 },
    ];
    expect(transform(points, "yoy")).toEqual([
      { date: "2026-01-01", value: 3 },
      { date: "2026-02-01", value: 2.5 },
    ]);
  });

  it("passes levels through", () => {
    const points = [{ date: "2026-01-01", value: 4.1 }];
    expect(transform(points, "level")).toBe(points);
  });
});
