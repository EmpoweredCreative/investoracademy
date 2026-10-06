import { describe, expect, it } from "vitest";
import { htmlToText, stripBold } from "../html";
import { extractSections } from "../sections";
import { diffRiskHeadings, similarity } from "../riskDiff";
import { parseCompanyFacts } from "../xbrl";

const b = (s: string) => `<p><span style="font-weight:700">${s}</span></p>`;

// A trimmed 10-K: table of contents first (short), then the real sections.
const TEN_K = `
<html><head><style>.x{}</style></head><body>
<div style="display:none"><ix:header>hidden facts</ix:header></div>
<table><tr><td>Item 1.</td><td>Business</td><td>3</td></tr><tr><td>Item 1A.</td><td>Risk Factors</td><td>9</td></tr><tr><td>Item 7.</td><td>MD&amp;A</td><td>20</td></tr></table>
${b("Item 1—Business")}
<p>Acme makes widgets&#160;and sells memberships. Members renew at 90%.</p>
${b("Item 1A—Risk Factors")}
<p>The risks below could materially affect us.</p>
${b("Business and Operating Risks")}
${b("We depend heavily on sales in the United States.")}
<p>Most of our revenue comes from the U.S.</p>
${b("Our failure to maintain membership growth could hurt results.")}
<p>Membership fees are most of our profit.</p>
${b("Item 1B—Unresolved Staff Comments")}
<p>None.</p>
${b("Item 7—Management's Discussion and Analysis of Financial Condition and Results of Operations (amounts in millions, except per share data and warehouse counts, which are shown in units)")}
<p>Net sales grew 8%.</p>
${b("Item 7A—Quantitative and Qualitative Disclosures About Market Risk")}
<p>We hedge foreign currency.</p>
${b("Item 8—Financial Statements")}
</body></html>`;

describe("htmlToText", () => {
  it("drops hidden XBRL headers, decodes entities and keeps bold markers", () => {
    const text = htmlToText(TEN_K);
    expect(text).not.toContain("hidden facts");
    expect(stripBold(text)).toContain("Acme makes widgets and sells memberships.");
    expect(stripBold(text)).toContain("Item 1. | Business | 3");
    expect(text).toContain("\u0001Item 1A—Risk Factors\u0002");
  });
});

describe("extractSections", () => {
  const { sections, riskHeadings } = extractSections(htmlToText(TEN_K), "10-K");

  it("takes the real section, not the table-of-contents line", () => {
    expect(sections.business).toContain("Members renew at 90%");
    expect(sections.riskFactors).toContain("Membership fees are most of our profit.");
    expect(sections.riskFactors).not.toContain("Unresolved Staff Comments");
  });

  it("finds long MD&A headings and Item 7A separately", () => {
    expect(sections.mdna).toContain("Net sales grew 8%");
    expect(sections.mdna).not.toContain("hedge foreign currency");
    expect(sections.marketRisk).toContain("hedge foreign currency");
  });

  it("lists bold risk headings with their category", () => {
    expect(riskHeadings).toEqual([
      { category: "Business and Operating Risks", title: "We depend heavily on sales in the United States." },
      { category: "Business and Operating Risks", title: "Our failure to maintain membership growth could hurt results." },
    ]);
  });

  it("reads 20-F risk factors from Item 3.D", () => {
    const html = `${b("ITEM 3. KEY INFORMATION")}<p>A. Reserved</p>${b("D. Risk Factors")}${b(
      "Risks Related to Our Business"
    )}${b("We face intense competition, which could reduce our market share.")}<p>Detail.</p>${b(
      "ITEM 4. INFORMATION ON THE COMPANY"
    )}<p>We deliver parcels across China.</p>${b("ITEM 5. OPERATING AND FINANCIAL REVIEW AND PROSPECTS")}<p>Revenue rose.</p>${b(
      "ITEM 6. DIRECTORS"
    )}`;
    const r = extractSections(htmlToText(html), "20-F");
    expect(r.sections.riskFactors).toContain("We face intense competition");
    expect(r.sections.riskFactors).not.toContain("Reserved");
    expect(r.sections.business).toContain("parcels across China");
    expect(r.sections.mdna).toContain("Revenue rose");
    expect(r.riskHeadings.map((h) => h.title)).toEqual(["We face intense competition, which could reduce our market share."]);
  });
});

describe("diffRiskHeadings", () => {
  const h = (title: string) => ({ category: null, title });

  it("separates added, removed, reworded and unchanged risks", () => {
    const prev = [
      h("We depend heavily on sales in the United States and Canada."),
      h("Pandemics such as COVID-19 could disrupt our operations."),
      h("Our failure to maintain membership growth, loyalty and brand recognition could adversely affect our results."),
    ];
    const cur = [
      h("We depend heavily on sales in the United States and Canada."),
      h("Our failure to maintain membership growth and loyalty could adversely affect our results of operations."),
      h("Changes in tariffs and trade policy could increase our merchandise costs."),
    ];
    const d = diffRiskHeadings(prev, cur);
    expect(d.unchangedCount).toBe(1);
    expect(d.reworded).toHaveLength(1);
    expect(d.reworded[0].to).toContain("membership growth and loyalty");
    expect(d.added.map((x) => x.title)).toEqual(["Changes in tariffs and trade policy could increase our merchandise costs."]);
    expect(d.removed.map((x) => x.title)).toEqual(["Pandemics such as COVID-19 could disrupt our operations."]);
  });

  it("scores unrelated headings low", () => {
    expect(similarity("Cybersecurity incidents could expose customer data.", "Interest rates could raise our borrowing costs.")).toBeLessThan(0.2);
  });
});

describe("parseCompanyFacts", () => {
  const fy = (end: string, val: number, extra: Partial<{ start: string; filed: string }> = {}) => ({
    start: extra.start ?? `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`,
    end,
    val,
    form: "10-K",
    fp: "FY",
    filed: extra.filed ?? `${end.slice(0, 4)}-10-01`,
  });
  const inst = (end: string, val: number) => ({ end, val, form: "10-K", fp: "FY", filed: `${end.slice(0, 4)}-10-01` });

  it("merges tag fallbacks, keeps restated values and derives ratios", () => {
    const data = {
      entityName: "Acme",
      facts: {
        "us-gaap": {
          SalesRevenueNet: { units: { USD: [fy("2022-12-31", 100)] } },
          Revenues: { units: { USD: [fy("2023-12-31", 120), fy("2023-12-31", 125, { filed: "2024-11-01" })] } },
          OperatingIncomeLoss: { units: { USD: [fy("2022-12-31", 20), fy("2023-12-31", 25)] } },
          NetIncomeLoss: { units: { USD: [fy("2022-12-31", 15), fy("2023-12-31", 18)] } },
          NetCashProvidedByUsedInOperatingActivities: { units: { USD: [fy("2023-12-31", 30)] } },
          PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fy("2023-12-31", 10)] } },
          StockholdersEquity: { units: { USD: [inst("2023-12-30", 90)] } },
          // A quarterly fact must be ignored.
          IncomeTaxExpenseBenefit: { units: { USD: [{ ...fy("2023-12-31", 99), start: "2023-10-01" }] } },
        },
      },
    };
    const r = parseCompanyFacts(data);
    expect(r.currency).toBe("USD");
    expect(r.years.map((y) => [y.fiscalYear, y.revenue])).toEqual([
      [2022, 100],
      [2023, 125],
    ]);
    const y23 = r.years[1];
    expect(y23.freeCashFlow).toBe(20);
    expect(y23.operatingMargin).toBeCloseTo(20);
    expect(y23.equity).toBe(90); // instant fact a day off the period end
    expect(y23.roe).toBeCloseTo(20);
    expect(y23.incomeTax).toBeUndefined();
  });

  it("uses the dominant reporting currency for foreign filers", () => {
    const data = {
      entityName: "Parcel Co",
      facts: {
        "us-gaap": {
          NetIncomeLoss: { units: { CNY: [fy("2022-12-31", 60), fy("2023-12-31", 70)], USD: [fy("2023-12-31", 10)] } },
        },
      },
    };
    const r = parseCompanyFacts(data);
    expect(r.currency).toBe("CNY");
    expect(r.years.at(-1)?.netIncome).toBe(70);
  });
});
