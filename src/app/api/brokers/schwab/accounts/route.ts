import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { maskAccountNumber, schwab } from "@/lib/schwab/client";
import { handleSchwabError } from "@/lib/schwab/errors";

/**
 * GET /api/brokers/schwab/accounts
 * Schwab accounts available to link, with balances and whether each is already linked.
 */
export async function GET() {
  try {
    const userId = await requireAuth();
    const [numbers, details] = await Promise.all([schwab.accountNumbers(userId), schwab.accounts(userId)]);
    const linked = await prisma.account.findMany({
      where: { userId, brokerAccountHash: { in: numbers.map((n) => n.hashValue) } },
      select: { id: true, name: true, brokerAccountHash: true },
    });

    const accounts = numbers.map((n) => {
      const detail = details.find((d) => d.securitiesAccount.accountNumber === n.accountNumber)?.securitiesAccount;
      const link = linked.find((l) => l.brokerAccountHash === n.hashValue);
      return {
        hash: n.hashValue,
        mask: maskAccountNumber(n.accountNumber),
        type: detail?.type ?? null,
        netLiq: detail?.currentBalances?.liquidationValue ?? null,
        cash: detail?.currentBalances?.cashBalance ?? null,
        positions: detail?.positions?.length ?? 0,
        linkedAccountId: link?.id ?? null,
        linkedAccountName: link?.name ?? null,
      };
    });
    return NextResponse.json({ accounts });
  } catch (error) {
    return handleSchwabError(error);
  }
}
