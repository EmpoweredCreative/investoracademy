import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { companyContext, type CompanyParams } from "@/lib/research/routeContext";
import { AI_NOT_CONFIGURED } from "@/lib/fundamentals/chatThread";
import { ensureDigests, ensureFilings } from "@/lib/sec/filings";

export const maxDuration = 300;

/** POST — summarise any of the last 5 annual reports that don't have an AI digest yet (cached forever). */
export async function POST(_req: NextRequest, { params }: CompanyParams) {
  try {
    const { symbol } = await companyContext(params);
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });
    const filings = await ensureDigests(await ensureFilings(symbol));
    return NextResponse.json({
      digests: filings.map((f) => ({ accession: f.accession, digest: f.digest, digestedAt: f.digestedAt?.toISOString() ?? null })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
