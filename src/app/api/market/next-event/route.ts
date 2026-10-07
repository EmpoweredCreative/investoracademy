import { NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { getHeadlineEvents } from "@/lib/marketdata/econCalendar";

/** GET — today's and upcoming market-moving releases for the top bar. */
export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({ events: await getHeadlineEvents().catch(() => []) });
  } catch (error) {
    return handleApiError(error);
  }
}
