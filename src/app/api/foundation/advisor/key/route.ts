import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { AdvisorError, connectOwnKey, disconnectOwnKey, ownKeyStatus } from "@/lib/foundation/advisorService";

/** GET — whether the person added their own Anthropic key (never returns the key). */
export async function GET() {
  try {
    const userId = await requireAuth();
    return NextResponse.json(await ownKeyStatus(userId));
  } catch (error) {
    return handleApiError(error);
  }
}

const putSchema = z.object({ key: z.string().min(1).max(500) });

/** PUT { key } — verify with Anthropic, then store encrypted. */
export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { key } = putSchema.parse(await req.json());
    return NextResponse.json(await connectOwnKey(userId, key));
  } catch (error) {
    if (error instanceof AdvisorError) return NextResponse.json({ error: error.message }, { status: error.status });
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const userId = await requireAuth();
    await disconnectOwnKey(userId);
    return NextResponse.json({ connected: false, hint: null });
  } catch (error) {
    return handleApiError(error);
  }
}
