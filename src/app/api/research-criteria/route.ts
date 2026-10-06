import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { criteriaProfileSchema, DEFAULT_PROFILE, METRICS } from "@/lib/fundamentals/criteria";
import { getUserCriteria, saveUserCriteria } from "@/lib/fundamentals/research";

/** GET /api/research-criteria — your thresholds plus the metric catalog. */
export async function GET() {
  try {
    const userId = await requireAuth();
    return NextResponse.json({ profile: await getUserCriteria(userId), defaults: DEFAULT_PROFILE, metrics: METRICS });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PUT /api/research-criteria — save thresholds. */
export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const profile = criteriaProfileSchema.parse(await req.json());
    await saveUserCriteria(userId, profile);
    return NextResponse.json({ profile });
  } catch (error) {
    return handleApiError(error);
  }
}
