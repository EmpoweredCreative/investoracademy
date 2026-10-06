import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { companyContext, type CompanyParams } from "@/lib/research/routeContext";
import { SECTION_KEYS, type SectionKey } from "@/lib/sec/sections";

const querySchema = z.object({ accession: z.string().min(10).max(30), section: z.enum(SECTION_KEYS) });

/** GET — the full text of one section of a stored annual report. */
export async function GET(req: NextRequest, { params }: CompanyParams) {
  try {
    const { symbol } = await companyContext(params);
    const { accession, section } = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const filing = await prisma.secFiling.findFirst({ where: { accession, symbol } });
    if (!filing) throw new Error("NOT_FOUND");
    const text = (filing.sections as Partial<Record<SectionKey, string>>)[section] ?? null;
    return NextResponse.json({ form: filing.form, fiscalYear: filing.fiscalYear, section, text, url: filing.url });
  } catch (error) {
    return handleApiError(error);
  }
}
