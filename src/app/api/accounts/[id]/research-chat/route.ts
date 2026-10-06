import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser } from "@/lib/fundamentals/accountAccess";
import { fundamentalChatPostSchema } from "@/lib/validations";
import { AI_NOT_CONFIGURED, clearThread, getThreadMessages, streamChatTurn } from "@/lib/fundamentals/chatThread";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

async function resolve(params: Params["params"]) {
  const userId = await requireAuth();
  const { id: accountId } = await params;
  await requireAccountForUser(accountId, userId);
  return { userId, accountId };
}

/** GET — the account-wide research desk conversation. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { accountId } = await resolve(params);
    return NextResponse.json({ messages: await getThreadMessages(accountId, null) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — one research-desk turn with Claude (any stock, the watchlist, holdings or criteria). Streams NDJSON. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { userId, accountId } = await resolve(params);
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });
    const { message, lens } = fundamentalChatPostSchema.parse(await req.json());
    return await streamChatTurn({ userId, accountId, symbol: null, message, lens });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { accountId } = await resolve(params);
    await clearThread(accountId, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
