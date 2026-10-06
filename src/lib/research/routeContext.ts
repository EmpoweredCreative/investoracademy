import { requireAuth } from "@/lib/api-helpers";
import { requireAccountForUser, normalizeSymbol } from "@/lib/fundamentals/accountAccess";

export type CompanyParams = { params: Promise<{ id: string; symbol: string }> };

/** Auth + account ownership + ticker normalisation for /api/accounts/[id]/company/[symbol]/* routes. */
export async function companyContext(params: CompanyParams["params"]) {
  const userId = await requireAuth();
  const { id: accountId, symbol: raw } = await params;
  await requireAccountForUser(accountId, userId);
  return { userId, accountId, symbol: normalizeSymbol(decodeURIComponent(raw)) };
}
