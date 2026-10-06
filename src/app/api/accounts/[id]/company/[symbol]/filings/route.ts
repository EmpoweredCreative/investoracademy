import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { companyContext, type CompanyParams } from "@/lib/research/routeContext";
import { ensureFilings, riskChanges } from "@/lib/sec/filings";
import { SECTION_KEYS, type SectionKey } from "@/lib/sec/sections";

// First load downloads up to 5 annual reports from EDGAR.
export const maxDuration = 120;

/** GET — the last 5 annual reports (10-K / 20-F) with digests (if generated) and risk-factor changes. */
export async function GET(_req: NextRequest, { params }: CompanyParams) {
  try {
    const { symbol } = await companyContext(params);
    const company = await ensureFilings(symbol);
    return NextResponse.json({
      symbol,
      companyName: company.companyName,
      cik: company.cik,
      filings: company.filings.map((f) => {
        const sections = f.sections as Partial<Record<SectionKey, string>>;
        return {
          accession: f.accession,
          form: f.form,
          fiscalYear: f.fiscalYear,
          periodEnd: f.periodEnd.toISOString().slice(0, 10),
          filedAt: f.filedAt.toISOString().slice(0, 10),
          url: f.url,
          sectionLengths: Object.fromEntries(SECTION_KEYS.map((k) => [k, sections[k]?.length ?? 0])),
          riskHeadingCount: (f.riskHeadings as unknown[]).length,
          digest: f.digest ?? null,
          digestedAt: f.digestedAt?.toISOString() ?? null,
        };
      }),
      riskChanges: riskChanges(company.filings),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
