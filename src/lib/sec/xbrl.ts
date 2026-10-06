import { padCik, secJson } from "./client";

/**
 * Long-term annual financials from SEC XBRL "company facts" (often 10–15 years).
 * Values stay in the company's reporting currency; callers convert for display.
 */
interface Fact {
  start?: string;
  end: string;
  val: number;
  form: string;
  fp?: string;
  filed: string;
}
interface CompanyFacts {
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, Fact[]> }>>;
}

/** Concept fallbacks, first match per year wins (companies switch tags over time). */
const CONCEPTS = {
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
  ],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  pretaxIncome: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ],
  incomeTax: ["IncomeTaxExpenseBenefit"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  dilutedEps: ["EarningsPerShareDiluted"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  depreciation: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation"],
  buybacks: ["PaymentsForRepurchaseOfCommonStock"],
  dividends: ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt", "LongTermDebtAndCapitalLeaseObligations"],
  currentDebt: ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  inventory: ["InventoryNet"],
  totalAssets: ["Assets"],
} as const;
type ConceptKey = keyof typeof CONCEPTS;

/** Balance-sheet items are point-in-time; everything else covers the fiscal year. */
const INSTANT = new Set<ConceptKey>(["equity", "longTermDebt", "currentDebt", "cash", "inventory", "totalAssets"]);

export type AnnualFacts = { fiscalYear: number; periodEnd: string } & Partial<Record<ConceptKey, number>> & {
  freeCashFlow?: number;
  totalDebt?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  roe?: number;
  roic?: number;
};

/** Businesses a cash-flow DCF doesn't fit (float / deposits make "free cash flow" and "cash" misleading). */
export type FinancialKind = "insurer" | "bank" | null;

export interface LongTermFinancials {
  entityName: string;
  currency: string;
  kind: FinancialKind;
  years: AnnualFacts[];
}

const DAY = 86_400_000;
const isAnnualForm = (f: string) => /^(10-K|20-F|40-F)/.test(f);

function annualValues(facts: Fact[], instant: boolean): Map<string, number> {
  const byEnd = new Map<string, Fact>();
  for (const f of facts) {
    if (!isAnnualForm(f.form)) continue;
    if (!instant) {
      if (!f.start) continue;
      const days = (Date.parse(f.end) - Date.parse(f.start)) / DAY;
      if (days < 340 || days > 380) continue;
    } else if (f.fp && f.fp !== "FY") {
      continue;
    }
    // Latest filing wins (restatements).
    const prev = byEnd.get(f.end);
    if (!prev || f.filed > prev.filed) byEnd.set(f.end, f);
  }
  return new Map([...byEnd].map(([end, f]) => [end, f.val]));
}

/** The reporting currency: the currency unit with the most annual monetary facts. */
function reportingCurrency(gaap: CompanyFacts["facts"][string]): string {
  const counts = new Map<string, number>();
  for (const key of ["revenue", "netIncome", "operatingCashFlow", "equity"] as ConceptKey[]) {
    for (const concept of CONCEPTS[key]) {
      for (const [unit, arr] of Object.entries(gaap[concept]?.units ?? {})) {
        if (/^[A-Z]{3}$/.test(unit)) counts.set(unit, (counts.get(unit) ?? 0) + arr.filter((f) => isAnnualForm(f.form)).length);
      }
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
}

const INSURER_TAGS = ["PremiumsEarnedNet", "LiabilityForClaimsAndClaimsAdjustmentExpense", "PolicyholderBenefitsAndClaimsIncurredNet"];
const BANK_TAGS = ["Deposits", "InterestAndDividendIncomeOperating", "LoansAndLeasesReceivableNetReportedAmount"];

function financialKind(gaap: CompanyFacts["facts"][string]): FinancialKind {
  const has = (tags: string[]) => tags.some((t) => Object.values(gaap[t]?.units ?? {}).some((arr) => arr.some((f) => isAnnualForm(f.form))));
  if (has(INSURER_TAGS)) return "insurer";
  if (has(BANK_TAGS)) return "bank";
  return null;
}

export function parseCompanyFacts(data: CompanyFacts, maxYears = 10): LongTermFinancials {
  const gaap = data.facts["us-gaap"] ?? data.facts["ifrs-full"] ?? {};
  const currency = reportingCurrency(gaap);
  const unitFor = (key: ConceptKey) => (key === "dilutedShares" ? "shares" : key === "dilutedEps" ? `${currency}/shares` : currency);

  const series = new Map<ConceptKey, Map<string, number>>();
  for (const key of Object.keys(CONCEPTS) as ConceptKey[]) {
    const merged = new Map<string, number>();
    for (const concept of CONCEPTS[key]) {
      const facts = gaap[concept]?.units?.[unitFor(key)];
      if (!facts) continue;
      for (const [end, val] of annualValues(facts, INSTANT.has(key))) if (!merged.has(end)) merged.set(end, val);
    }
    series.set(key, merged);
  }

  // Fiscal years are anchored on the revenue / net income period ends.
  const ends = [...new Set([...(series.get("revenue")?.keys() ?? []), ...(series.get("netIncome")?.keys() ?? [])])].sort();
  // Instant facts can be dated a day or two off the duration end; match within a week.
  const near = (m: Map<string, number> | undefined, end: string) => {
    if (!m) return undefined;
    if (m.has(end)) return m.get(end);
    const t = Date.parse(end);
    for (const [k, v] of m) if (Math.abs(Date.parse(k) - t) <= 7 * DAY) return v;
    return undefined;
  };

  const years: AnnualFacts[] = ends.slice(-maxYears).map((end) => {
    const y: AnnualFacts = { fiscalYear: Number(end.slice(0, 4)), periodEnd: end };
    for (const key of Object.keys(CONCEPTS) as ConceptKey[]) {
      const v = near(series.get(key), end);
      if (v !== undefined) y[key] = v;
    }
    if (y.operatingCashFlow != null && y.capex != null) y.freeCashFlow = y.operatingCashFlow - y.capex;
    if (y.longTermDebt != null || y.currentDebt != null) y.totalDebt = (y.longTermDebt ?? 0) + (y.currentDebt ?? 0);
    if (y.revenue) {
      if (y.grossProfit != null) y.grossMargin = (y.grossProfit / y.revenue) * 100;
      if (y.operatingIncome != null) y.operatingMargin = (y.operatingIncome / y.revenue) * 100;
      if (y.netIncome != null) y.netMargin = (y.netIncome / y.revenue) * 100;
    }
    if (y.netIncome != null && y.equity) y.roe = (y.netIncome / y.equity) * 100;
    if (y.operatingIncome != null && y.equity != null) {
      const rawTax = y.pretaxIncome && y.incomeTax != null ? y.incomeTax / y.pretaxIncome : 0.21;
      const taxRate = Math.min(Math.max(rawTax, 0), 0.35);
      const invested = y.equity + (y.totalDebt ?? 0) - (y.cash ?? 0);
      if (invested > 0) y.roic = ((y.operatingIncome * (1 - taxRate)) / invested) * 100;
    }
    return y;
  });

  return { entityName: data.entityName, currency, kind: financialKind(gaap), years };
}

const cache = new Map<string, { at: number; value: LongTermFinancials }>();
const TTL_MS = 12 * 3600_000;

export async function getLongTermFinancials(cik: string): Promise<LongTermFinancials> {
  const hit = cache.get(cik);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = parseCompanyFacts(await secJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`));
  cache.set(cik, { at: Date.now(), value });
  return value;
}
