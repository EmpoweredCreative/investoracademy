import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { getStrategyRecommendations } from "@/lib/services/strategyAlignmentEngine";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const label = searchParams.get("label");

    if (!label) {
      return NextResponse.json({ error: "Query param label required" }, { status: 400 });
    }

    const recommendations = getStrategyRecommendations(label);
    return NextResponse.json({ recommendations });
  } catch (error) {
    return handleApiError(error);
  }
}
