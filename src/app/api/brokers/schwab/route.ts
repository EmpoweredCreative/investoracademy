import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { isSchwabConfigured } from "@/lib/schwab/oauth";

/**
 * GET /api/brokers/schwab — connection status for the guide and status bar.
 */
export async function GET() {
  try {
    const userId = await requireAuth();
    const conn = await prisma.brokerConnection.findUnique({
      where: { userId_provider: { userId, provider: "SCHWAB" } },
      include: {
        accounts: {
          select: { id: true, name: true, brokerAccountMask: true, lastSyncedAt: true, lastSyncError: true, syncedNetLiq: true },
        },
      },
    });
    const expired = conn ? conn.refreshExpiresAt.getTime() <= Date.now() : false;
    return NextResponse.json({
      configured: isSchwabConfigured(),
      redirectUri: process.env.SCHWAB_REDIRECT_URI ?? null,
      connection: conn
        ? {
            status: expired ? "EXPIRED" : conn.status,
            refreshExpiresAt: conn.refreshExpiresAt.toISOString(),
            lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
            lastError: conn.lastError,
            accounts: conn.accounts.map((a) => ({
              ...a,
              lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
              syncedNetLiq: a.syncedNetLiq?.toNumber() ?? null,
            })),
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/brokers/schwab — forget tokens. Linked accounts keep their history and stop syncing.
 */
export async function DELETE() {
  try {
    const userId = await requireAuth();
    await prisma.brokerConnection.deleteMany({ where: { userId, provider: "SCHWAB" } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
