import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { companyContext, type CompanyParams } from "@/lib/research/routeContext";
import { getCompanyScore } from "@/lib/research/scoreService";

// May fetch 10-year SEC data and, for momentum lenses, price trend.
export const maxDuration = 60;

/** GET ?lens=buffett[&refresh=1] — the stock's WealthOS Score under a lens (recalculated when stale). */
export async function GET(req: NextRequest, { params }: CompanyParams) {
  try {
    const { userId, accountId, symbol } = await companyContext(params);
    const sp = req.nextUrl.searchParams;
    const score = await getCompanyScore({ userId, accountId, symbol, lensKey: sp.get("lens"), force: sp.get("refresh") === "1" });
    return NextResponse.json(score);
  } catch (error) {
    return handleApiError(error);
  }
}
