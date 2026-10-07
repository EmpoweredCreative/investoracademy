import { describe, expect, it } from "vitest";
import { allowanceWindow, costUsd, FIRST_MONTH_LIMIT, MONTHLY_LIMIT } from "../advisorLimits";

const d = (s: string) => new Date(s);

describe("allowanceWindow", () => {
  it("gives 50 messages for the first 30 days", () => {
    const w = allowanceWindow(d("2026-10-01T12:00:00Z"), d("2026-10-20T00:00:00Z"));
    expect(w).toMatchObject({ limit: FIRST_MONTH_LIMIT, intro: true });
    expect(w.end.toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });

  it("starts the intro window on the first message", () => {
    const now = d("2026-10-06T00:00:00Z");
    expect(allowanceWindow(null, now)).toMatchObject({ start: now, intro: true });
  });

  it("switches to 20 per calendar month after the intro", () => {
    const w = allowanceWindow(d("2026-08-01T00:00:00Z"), d("2026-10-06T00:00:00Z"));
    expect(w).toMatchObject({ limit: MONTHLY_LIMIT, intro: false });
    expect(w.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("doesn't double-count the month the intro ends in", () => {
    const w = allowanceWindow(d("2026-09-15T00:00:00Z"), d("2026-10-20T00:00:00Z"));
    expect(w.intro).toBe(false);
    expect(w.start.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });
});

describe("costUsd", () => {
  it("prices Sonnet 5.5 usage", () => {
    // 3k cached prompt read, 4k fresh input, 1.5k output
    expect(costUsd({ inputTokens: 4000, outputTokens: 1500, cacheReadTokens: 3000, cacheWriteTokens: 0 })).toBeCloseTo(0.0236, 4);
  });
});
