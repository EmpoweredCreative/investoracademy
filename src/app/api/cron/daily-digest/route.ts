import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendDailyDigest } from "@/lib/services/sendgridMailer";

/**
 * Vercel Cron endpoint for daily digest emails.
 * Configured in vercel.json with schedule: "30 20 * * *" (16:30 ET = 20:30 UTC)
 *
 * Protected by CRON_SECRET environment variable.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all users who have digest enabled
    const users = await prisma.user.findMany({
      where: {
        notifyFreq: "DAILY_DIGEST",
        notifyChannel: { in: ["EMAIL", "IN_APP"] },
      },
      select: { id: true, email: true },
    });

    const results = {
      total: users.length,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const user of users) {
      try {
        await sendDailyDigest(user.id);
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `User ${user.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("[Cron] Daily digest failed:", error);
    return NextResponse.json(
      { error: "Cron job failed" },
      { status: 500 }
    );
  }
}
