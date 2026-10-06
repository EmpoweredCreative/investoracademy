import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser, normalizeSymbol } from "@/lib/fundamentals/accountAccess";
import { refreshSymbolFundamentals } from "@/lib/fundamentals/yahooFundamentals";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; symbol: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId, symbol: rawSymbol } = await params;
    await requireAccountForUser(accountId, userId);
    const symbol = normalizeSymbol(decodeURIComponent(rawSymbol));

    await refreshSymbolFundamentals(accountId, symbol);

    return NextResponse.json({ ok: true, symbol });
  } catch (error) {
    return handleApiError(error);
  }
}
