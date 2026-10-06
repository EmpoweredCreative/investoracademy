import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncSchwabAccount } from "@/lib/schwab/sync";

export const maxDuration = 300;

/**
 * Vercel Cron: sync every linked Schwab account and warn before the 7-day authorization lapses.
 * Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { synced: 0, failed: 0, warned: 0, errors: [] as string[] };
  const connections = await prisma.brokerConnection.findMany({
    where: { provider: "SCHWAB" },
    include: { accounts: { where: { archivedAt: null }, select: { id: true, name: true } } },
  });

  for (const conn of connections) {
    const msLeft = conn.refreshExpiresAt.getTime() - Date.now();
    if (msLeft <= 0) continue;

    if (msLeft < 36 * 3600_000 && conn.status !== "EXPIRING") {
      await prisma.brokerConnection.update({ where: { id: conn.id }, data: { status: "EXPIRING" } });
      await prisma.notification.create({
        data: {
          userId: conn.userId,
          title: "Reconnect Schwab soon",
          body: `Your Schwab authorization expires in about ${Math.max(1, Math.round(msLeft / 3600_000))} hours. Reconnect from the connection guide to keep syncing.`,
        },
      });
      results.warned++;
    }

    for (const account of conn.accounts) {
      try {
        await syncSchwabAccount(account.id);
        results.synced++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${account.name}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  return NextResponse.json(results);
}
