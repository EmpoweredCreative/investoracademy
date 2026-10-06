import { Prisma, type SecFiling } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listAnnualFilings, lookupCik, secText, SecError, type AnnualFilingRef } from "./client";
import { htmlToText } from "./html";
import { extractSections, type RiskHeading, type SectionKey } from "./sections";
import { diffRiskHeadings, type RiskDiff } from "./riskDiff";
import { DIGEST_MODEL, digestFiling, type FilingDigest } from "./digest";

const INDEX_TTL_MS = 6 * 3600_000;
const indexCache = new Map<string, { at: number; cik: string; name: string; refs: AnnualFilingRef[] }>();

async function filingIndex(symbol: string) {
  const sym = symbol.toUpperCase();
  const hit = indexCache.get(sym);
  if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit;
  const company = await lookupCik(sym);
  if (!company) throw new SecError(`${sym} isn't in SEC EDGAR, so there are no 10-K/20-F filings to read (it may be an ETF or not SEC-registered).`);
  const refs = await listAnnualFilings(company.cik, 5);
  const entry = { at: Date.now(), cik: company.cik, name: company.name, refs };
  indexCache.set(sym, entry);
  return entry;
}

/** Fetch, parse and store one filing. */
async function ingest(symbol: string, cik: string, ref: AnnualFilingRef): Promise<SecFiling> {
  const text = htmlToText(await secText(ref.url));
  const { sections, riskHeadings } = extractSections(text, ref.form);
  const periodEnd = new Date(`${ref.periodEnd}T00:00:00Z`);
  return prisma.secFiling.upsert({
    where: { accession: ref.accession },
    create: {
      cik,
      symbol,
      accession: ref.accession,
      form: ref.form,
      // Fiscal years ending in early January belong to the prior year (retail calendars).
      fiscalYear: periodEnd.getUTCMonth() === 0 && periodEnd.getUTCDate() < 15 ? periodEnd.getUTCFullYear() - 1 : periodEnd.getUTCFullYear(),
      periodEnd,
      filedAt: new Date(`${ref.filedAt}T00:00:00Z`),
      url: ref.url,
      sections: sections as Prisma.InputJsonValue,
      riskHeadings: riskHeadings as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
}

export interface CompanyFilings {
  symbol: string;
  cik: string;
  companyName: string;
  filings: SecFiling[];
}

/** The last 5 annual reports for a ticker, newest first, downloading any we don't have yet. */
export async function ensureFilings(symbol: string): Promise<CompanyFilings> {
  const sym = symbol.toUpperCase();
  const { cik, name, refs } = await filingIndex(sym);
  const stored = await prisma.secFiling.findMany({ where: { accession: { in: refs.map((r) => r.accession) } } });
  const have = new Set(stored.map((f) => f.accession));
  const fetched: SecFiling[] = [];
  for (const ref of refs) {
    if (!have.has(ref.accession)) fetched.push(await ingest(sym, cik, ref));
  }
  const filings = [...stored, ...fetched].sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());
  return { symbol: sym, cik, companyName: name, filings };
}

/** Summarise any filings that don't have a digest yet (a few in parallel). */
export async function ensureDigests(company: CompanyFilings): Promise<SecFiling[]> {
  const pending = company.filings.filter((f) => !f.digest);
  const results = new Map<string, SecFiling>();
  const queue = [...pending];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const sections = f.sections as Partial<Record<SectionKey, string>>;
      const digest = await digestFiling({
        companyName: company.companyName,
        symbol: company.symbol,
        form: f.form,
        fiscalYear: f.fiscalYear,
        sections,
      });
      results.set(
        f.id,
        await prisma.secFiling.update({
          where: { id: f.id },
          data: { digest: digest as unknown as Prisma.InputJsonValue, digestModel: DIGEST_MODEL, digestedAt: new Date() },
        })
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  return company.filings.map((f) => results.get(f.id) ?? f);
}

/** Year-over-year risk-factor changes, newest comparison first. */
export function riskChanges(filings: SecFiling[]): { fiscalYear: number; vsYear: number; diff: RiskDiff }[] {
  const out: { fiscalYear: number; vsYear: number; diff: RiskDiff }[] = [];
  for (let i = 0; i < filings.length - 1; i++) {
    const cur = filings[i].riskHeadings as unknown as RiskHeading[];
    const prev = filings[i + 1].riskHeadings as unknown as RiskHeading[];
    if (!cur.length || !prev.length) continue;
    out.push({ fiscalYear: filings[i].fiscalYear, vsYear: filings[i + 1].fiscalYear, diff: diffRiskHeadings(prev, cur) });
  }
  return out;
}

export const digestOf = (f: SecFiling) => (f.digest as FilingDigest | null) ?? null;
