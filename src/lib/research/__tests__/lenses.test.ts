import { describe, expect, it, vi } from "vitest";

// strategies.ts reads saved strategies from the DB; these tests only need its schema.
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { criteriaProfileSchema } from "@/lib/fundamentals/criteria";
import { BUILTIN_LENS_KEYS, LENSES, getBuiltinLens } from "../lenses";
import { strategyInputSchema } from "../strategies";
import { describeFilter, normalizeFilters } from "@/lib/finviz/filters";
import { buildScreenUrl, parseNumber, parseScreenCsv } from "@/lib/finviz/client";

describe("built-in lenses", () => {
  it.each(BUILTIN_LENS_KEYS)("%s has a valid criteria preset", (key) => {
    const lens = LENSES[key];
    expect(criteriaProfileSchema.safeParse(lens.criteria).success).toBe(true);
    expect(lens.criteria.criteria.some((c) => c.enabled)).toBe(true);
  });

  it.each(BUILTIN_LENS_KEYS)("%s screens only with known Finviz codes", (key) => {
    for (const code of LENSES[key].finvizFilters) expect(describeFilter(code), code).not.toBeNull();
  });

  it.each(BUILTIN_LENS_KEYS)("%s asks the core research questions", (key) => {
    const qs = LENSES[key].questions.join(" ").toLowerCase();
    expect(qs).toContain("competitive advantage");
    expect(qs).toContain("moat");
    expect(qs).toContain("greatest risk");
  });

  it("only resolves known lens keys", () => {
    expect(getBuiltinLens("lynch")?.name).toBe("Lynch");
    expect(getBuiltinLens("strategy:abc")).toBeNull();
    expect(getBuiltinLens(null)).toBeNull();
  });

  it("built-in presets are valid strategy templates", () => {
    const k = LENSES.buffett;
    expect(strategyInputSchema.safeParse({ name: "Buffett-style", baseLens: "buffett", finvizFilters: k.finvizFilters, criteria: k.criteria, questions: [] }).success).toBe(true);
  });
});

describe("Finviz filters", () => {
  it("keeps one option per filter and drops unknown codes", () => {
    expect(normalizeFilters(["fa_pe_u15", "fa_pe_u20", "bogus_x", "cap_midover"])).toEqual(["fa_pe_u20", "cap_midover"]);
  });

  it("describes codes in plain English", () => {
    expect(describeFilter("fa_debteq_u0.5")).toEqual({ filter: "Debt/Equity", option: "Under 0.5" });
  });

  it("builds an Elite export URL", () => {
    const url = buildScreenUrl(["fa_pe_u20", "cap_midover"], { token: "T0K", sort: "-marketcap" });
    expect(url).toMatch(/^https:\/\/elite\.finviz\.com\/export\.ashx\?/);
    expect(url).toContain("f=fa_pe_u20,cap_midover");
    expect(url).toContain("auth=T0K");
    expect(url).toContain("o=-marketcap");
    expect(url).toContain("v=152");
  });

  it("parses Finviz numbers", () => {
    expect(parseNumber("12.5%")).toBe(12.5);
    expect(parseNumber("1,234.50")).toBe(1234.5);
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("-3.2%")).toBe(-3.2);
  });

  it("parses an export by column name", () => {
    const csv = [
      '"No.","Ticker","Company","Sector","Industry","Country","Market Cap","P/E","PEG","Return on Equity","Total Debt/Equity","Price"',
      '"1","KO","Coca-Cola Co","Consumer Defensive","Beverages - Non-Alcoholic","USA","300000.50","24.10","2.80","40.12%","1.60","69.50"',
      '"2","MO","Altria","Consumer Defensive","Tobacco","USA","95000","9.20","-","-","-","55.10"',
    ].join("\n");
    const rows = parseScreenCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ symbol: "KO", company: "Coca-Cola Co", sector: "Consumer Defensive", marketCap: 300000.5, price: 69.5 });
    expect(rows[0].metrics).toMatchObject({ pe: 24.1, peg: 2.8, roe: 40.12, debtToEquity: 1.6 });
    expect(rows[1].metrics.peg).toBeNull();
  });
});

describe("Finviz token input", () => {
  it("accepts a bare token or an Elite export link", async () => {
    const { extractToken } = await import("@/lib/finviz/credentials");
    expect(extractToken("  abc123-DEF456-ghi  ")).toBe("abc123-DEF456-ghi");
    expect(extractToken("https://elite.finviz.com/export.ashx?v=111&f=cap_mega&auth=abc123-DEF456-ghi")).toBe("abc123-DEF456-ghi");
    expect(() => extractToken("hello world")).toThrow(/Finviz Elite API token/);
  });
});
