import { prisma } from "@/lib/db";

export async function requireAccountForUser(accountId: string, userId: string) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    throw new Error("NOT_FOUND");
  }
  return account;
}

export function normalizeSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(s)) {
    throw new Error("INVALID_SYMBOL");
  }
  return s;
}
