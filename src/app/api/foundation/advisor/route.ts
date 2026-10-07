import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { AdvisorError, archiveConversation, getAdvisorState, streamAdvisorTurn } from "@/lib/foundation/advisorService";

export const maxDuration = 300;

const postSchema = z.object({ message: z.string().trim().min(1).max(4000) });

/** GET — the conversation, the person's remaining messages, and whether they've added their own key. */
export async function GET() {
  try {
    const userId = await requireAuth();
    return NextResponse.json(await getAdvisorState(userId));
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST { message } — one advisor turn, streamed as NDJSON. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { message } = postSchema.parse(await req.json());
    return await streamAdvisorTurn(userId, message);
  } catch (error) {
    if (error instanceof AdvisorError) return NextResponse.json({ error: error.message }, { status: error.status });
    return handleApiError(error);
  }
}

/** DELETE — start over (messages are archived, and still count toward the monthly limit). */
export async function DELETE() {
  try {
    const userId = await requireAuth();
    await archiveConversation(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
