import { prisma } from "@/lib/db";
import { getFxRate, snapshotCurrencies } from "@/lib/marketdata/fx";
import { lookupCik, SecError } from "@/lib/sec/client";
import { getLongTermFinancials, type AnnualFacts, type FinancialKind } from "@/lib/sec/xbrl";

/** Money fields in AnnualFacts that need currency conversion (ratios, shares and percents don't). */
const MONEY_KEYS = [
  "revenue",
  "grossProfit",
  "operatingIncome",
  "pretaxIncome",
  "incomeTax",
  "netIncome",
  "dilutedEps",
  "operatingCashFlow",
  "capex",
  "depreciation",
  "buybacks",
  "dividends",
  "equity",
  "longTermDebt",
  "currentDebt",
  "cash",
  "inventory",
  "totalAssets",
  "freeCashFlow",
  "totalDebt",
] as const;

export interface CompanyFinancials {
  entityName: string;
  currency: string;
  kind: FinancialKind;
  /** Set when figures were converted from the reporting currency. */
  currencyNote: string | null;
  years: AnnualFacts[];
}

/**
 * ~10 years of annual figures from SEC XBRL, converted into the stock's trading
 * currency (so a CNY filer like ZTO lines up with its USD share price).
 */
export async function getCompanyFinancials(accountId: string, symbol: string): Promise<CompanyFinancials> {
  const company = await lookupCik(symbol);
  if (!company) throw new SecError(`${symbol} isn't in SEC EDGAR, so long-term SEC financials aren't available.`);
  const data = await getLongTermFinancials(company.cik);

  const snapshot = await prisma.fundamentalSnapshot.findUnique({
    where: { accountId_symbol: { accountId, symbol } },
    select: { raw: true },
  });
  const target = snapshotCurrencies(snapshot?.raw).quote ?? "USD";
  if (data.currency === target) return { entityName: data.entityName, currency: target, kind: data.kind, currencyNote: null, years: data.years };

  const fx = await getFxRate(data.currency, target);
  if (fx == null) {
    return {
      entityName: data.entityName,
      currency: data.currency,
      kind: data.kind,
      currencyNote: `Figures are in ${data.currency} (no ${data.currency}→${target} rate available right now).`,
      years: data.years,
    };
  }
  const years = data.years.map((y) => {
    const out: AnnualFacts = { ...y };
    for (const k of MONEY_KEYS) if (y[k] != null) out[k] = (y[k] as number) * fx;
    return out;
  });
  return {
    entityName: data.entityName,
    currency: target,
    kind: data.kind,
    currencyNote: `Converted from ${data.currency} to ${target} at today's rate (${fx.toFixed(4)}).`,
    years,
  };
}
