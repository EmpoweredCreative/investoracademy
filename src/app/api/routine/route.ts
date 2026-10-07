import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { getRoutine, routinePatchSchema, saveRoutine } from "@/lib/services/marketRoutine";

/** Today's top-down routine for the signed-in user. ?date=YYYY-MM-DD (user's local date). */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const date = req.nextUrl.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Query param date (YYYY-MM-DD) required" }, { status: 400 });
    }
    return NextResponse.json(await getRoutine(userId, date));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const patch = routinePatchSchema.parse(await req.json());
    return NextResponse.json(await saveRoutine(userId, patch));
  } catch (error) {
    return handleApiError(error);
  }
}
