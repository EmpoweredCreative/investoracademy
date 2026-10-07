import { NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { INDICATORS, YIELDS, fredConfigured, getHistory, getYieldCurve } from "@/lib/marketdata/fred";

/** Economy page data: 2-year history per indicator plus the yield curve. */
export async function GET() {
  try {
    await requireAuth();
    if (!fredConfigured()) return NextResponse.json({ configured: false, series: [], curve: [] });

    const defs = [...INDICATORS, ...YIELDS];
    const [histories, curve] = await Promise.all([
      Promise.allSettled(defs.map((d) => getHistory(d))),
      getYieldCurve().catch(() => []),
    ]);
    const series = defs.map((d, i) => ({
      key: d.key,
      label: d.label,
      description: d.description,
      transform: d.transform,
      points: histories[i].status === "fulfilled" ? histories[i].value : [],
    }));
    return NextResponse.json({ configured: true, series, curve });
  } catch (error) {
    return handleApiError(error);
  }
}
