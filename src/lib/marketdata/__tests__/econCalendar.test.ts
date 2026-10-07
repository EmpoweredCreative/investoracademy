import { describe, expect, it } from "vitest";
import { formatTvValue, matchTvEvent } from "../econCalendar";

const at = (iso: string) => Date.parse(iso);
const tv = [
  { title: "ISM Services PMI", date: "2026-10-05T14:00:00.000Z", actual: 54.9, forecast: 55, previous: 55.4 },
  { title: "Initial Jobless Claims", date: "2026-10-08T12:30:00.000Z", actual: null, forecast: 200, previous: 197, scale: "K" },
  { title: "Continuing Jobless Claims", date: "2026-10-08T12:30:00.000Z", actual: null, forecast: 1710, previous: 1701, scale: "K" },
  { title: "Michigan Consumer Sentiment Prel", date: "2026-10-09T14:00:00.000Z", actual: null, forecast: 47.6, previous: 48.1 },
  { title: "Michigan 5 Year Inflation Expectations Prel", date: "2026-10-09T14:00:00.000Z", actual: null, forecast: null, previous: 3.4, unit: "%" },
  { title: "Michigan Inflation Expectations Prel", date: "2026-10-09T14:00:00.000Z", actual: null, forecast: null, previous: 4.6, unit: "%" },
  { title: "Inflation Rate MoM", date: "2026-10-14T12:30:00.000Z", actual: 0.3, forecast: 0.3, previous: 0.4, unit: "%" },
  { title: "Core Inflation Rate MoM", date: "2026-10-14T12:30:00.000Z", actual: 0.2, forecast: 0.3, previous: 0.3, unit: "%" },
  { title: "FOMC Minutes", date: "2026-10-07T18:00:00.000Z", actual: null, forecast: null, previous: null },
];

describe("matchTvEvent", () => {
  it("matches Forex Factory titles to TradingView's names at the same time", () => {
    expect(matchTvEvent("ISM Services PMI", at("2026-10-05T14:00:00Z"), tv)?.actual).toBe(54.9);
    expect(matchTvEvent("Unemployment Claims", at("2026-10-08T12:30:00Z"), tv)?.title).toBe("Initial Jobless Claims");
    expect(matchTvEvent("Prelim UoM Consumer Sentiment", at("2026-10-09T14:00:00Z"), tv)?.title).toBe("Michigan Consumer Sentiment Prel");
    expect(matchTvEvent("Prelim UoM Inflation Expectations", at("2026-10-09T14:00:00Z"), tv)?.title).toBe("Michigan Inflation Expectations Prel");
    expect(matchTvEvent("CPI m/m", at("2026-10-14T12:30:00Z"), tv)?.title).toBe("Inflation Rate MoM");
    expect(matchTvEvent("Core CPI m/m", at("2026-10-14T12:30:00Z"), tv)?.title).toBe("Core Inflation Rate MoM");
    expect(matchTvEvent("FOMC Meeting Minutes", at("2026-10-07T18:00:00Z"), tv)?.title).toBe("FOMC Minutes");
  });

  it("won't match a different time or an unrelated release", () => {
    expect(matchTvEvent("ISM Services PMI", at("2026-10-06T14:00:00Z"), tv)).toBeNull();
    expect(matchTvEvent("Retail Sales m/m", at("2026-10-14T12:30:00Z"), tv)).toBeNull();
  });
});

describe("formatTvValue", () => {
  it("formats values like Forex Factory", () => {
    expect(formatTvValue(54.9)).toBe("54.9");
    expect(formatTvValue(0.3, "%")).toBe("0.3%");
    expect(formatTvValue(200, null, "K")).toBe("200K");
    expect(formatTvValue(-105.6, "$", "B")).toBe("$-105.6B");
    expect(formatTvValue(null)).toBeNull();
  });
});

import { likeSample } from "../econCalendar";

describe("likeSample", () => {
  it("adds the unit the other columns use", () => {
    expect(likeSample("0.4", "0.3%")).toBe("0.4%");
    expect(likeSample("205", "197K")).toBe("205K");
    expect(likeSample("0.4%", "0.3%")).toBe("0.4%");
    expect(likeSample("54.9", "55.4")).toBe("54.9");
    expect(likeSample(null, "1%")).toBeNull();
  });
});
