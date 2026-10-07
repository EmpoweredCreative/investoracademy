import { NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { getLiveQuotes } from "@/lib/marketdata/liveQuotes";
import { YAHOO_YIELDS, fredConfigured, getReadings, getYieldCurve, type Reading } from "@/lib/marketdata/fred";
import { getEconomicCalendar, weekStartET } from "@/lib/marketdata/econCalendar";

/** Step 2 data: latest economic readings, live Treasury yields, the yield curve and upcoming releases. */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const days = Math.min(Number(new URL(req.url).searchParams.get("days")) || 7, 60);
    const configured = fredConfigured();

    const [readings, quotes, calendar, curve] = await Promise.all([
      configured ? getReadings().catch(() => ({}) as Record<string, Reading>) : Promise.resolve({} as Record<string, Reading>),
      getLiveQuotes(Object.values(YAHOO_YIELDS)),
      // This week so far (with actuals) through `days` ahead.
      getEconomicCalendar(weekStartET(), days).catch(() => []),
      configured ? getYieldCurve().catch(() => []) : Promise.resolve([]),
    ]);

    const liveYields = Object.fromEntries(
      Object.entries(YAHOO_YIELDS).map(([key, symbol]) => {
        const q = quotes[symbol.toUpperCase()];
        return [key, q?.price != null ? { value: q.price, change: q.change, time: q.time } : null];
      })
    );

    return NextResponse.json({ configured, readings, liveYields, calendar, curve, asOf: new Date().toISOString() });
  } catch (error) {
    return handleApiError(error);
  }
}
