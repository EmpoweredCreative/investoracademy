import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser, normalizeSymbol } from "@/lib/fundamentals/accountAccess";
import { fundamentalChatPostSchema } from "@/lib/validations";
import { AI_NOT_CONFIGURED, clearThread, getThreadMessages, streamChatTurn } from "@/lib/fundamentals/chatThread";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string; symbol: string }> };

async function resolve(params: Params["params"]) {
  const userId = await requireAuth();
  const { id: accountId, symbol: rawSymbol } = await params;
  await requireAccountForUser(accountId, userId);
  return { userId, accountId, symbol: normalizeSymbol(decodeURIComponent(rawSymbol)) };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { accountId, symbol } = await resolve(params);
    return NextResponse.json({ messages: await getThreadMessages(accountId, symbol) });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST — one research turn with Claude about this stock.
 * Streams newline-delimited JSON events: text deltas, tool start/end, proposals, done.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { userId, accountId, symbol } = await resolve(params);
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });
    const { message, lens } = fundamentalChatPostSchema.parse(await req.json());
    return await streamChatTurn({ userId, accountId, symbol, message, lens });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { accountId, symbol } = await resolve(params);
    await clearThread(accountId, symbol);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
