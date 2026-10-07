import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { loadFoundation, netWorthHistory } from "@/lib/foundation/store";

/** GET — everything Foundation shows: records, calculations and net worth history. ?businessEnd=YYYY-MM picks the P&L window. */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const end = req.nextUrl.searchParams.get("businessEnd");
    const data = await loadFoundation(userId, { businessEnd: end && /^\d{4}-\d{2}$/.test(end) ? end : undefined });
    const history = await netWorthHistory(userId, data.today, {
      assets: data.summary.assets.total,
      liabilities: data.summary.debt.total,
      liquid: data.summary.assets.liquid,
    });
    return NextResponse.json({ ...data, history });
  } catch (error) {
    return handleApiError(error);
  }
}
