import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { companyContext, type CompanyParams } from "@/lib/research/routeContext";
import { getCompanyFinancials } from "@/lib/research/company";

/** GET — about 10 years of annual financials from SEC XBRL, in the stock's trading currency. */
export async function GET(_req: NextRequest, { params }: CompanyParams) {
  try {
    const { accountId, symbol } = await companyContext(params);
    return NextResponse.json(await getCompanyFinancials(accountId, symbol));
  } catch (error) {
    return handleApiError(error);
  }
}
