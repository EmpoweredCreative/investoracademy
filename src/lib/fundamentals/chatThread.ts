import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getUserCriteria } from "./research";
import { runResearchTurn, type AgentEvent } from "./agent";
import { getBuiltinLens } from "@/lib/research/lenses";
import { resolveLens } from "@/lib/research/strategies";

/** Thread key for the account-wide research desk (real tickers start with a letter). */
export const DESK_THREAD = "_DESK";

const HISTORY_TURNS = 30;

export const AI_NOT_CONFIGURED = "AI research is not configured. Add ANTHROPIC_API_KEY to the server environment.";

const threadKey = (symbol: string | null) => symbol ?? DESK_THREAD;

export async function getThreadMessages(accountId: string, symbol: string | null) {
  const thread = await prisma.fundamentalChatThread.findUnique({
    where: { accountId_symbol: { accountId, symbol: threadKey(symbol) } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return (
    thread?.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolEvents: m.toolEvents ?? null,
      lens: (m.contextSnapshot as { lens?: string | null } | null)?.lens ?? null,
      createdAt: m.createdAt.toISOString(),
    })) ?? []
  );
}

export async function clearThread(accountId: string, symbol: string | null) {
  await prisma.fundamentalChatThread.deleteMany({ where: { accountId, symbol: threadKey(symbol) } });
}

/**
 * One research turn with Claude, as a newline-delimited JSON stream of AgentEvents.
 * Saves the user message up front and the reply (with its tool log) when done.
 */
export async function streamChatTurn(opts: {
  userId: string;
  accountId: string;
  symbol: string | null;
  message: string;
  lens?: string | null;
}): Promise<Response> {
  const { userId, accountId, symbol, message } = opts;
  // Built-in lenses and saved strategies; no lens keeps the user's own criteria.
  const lens = getBuiltinLens(opts.lens) ?? (opts.lens?.startsWith("strategy:") ? await resolveLens(userId, opts.lens) : null);
  const profile = lens ? lens.criteria : await getUserCriteria(userId);

  const thread = await prisma.fundamentalChatThread.upsert({
    where: { accountId_symbol: { accountId, symbol: threadKey(symbol) } },
    create: { accountId, symbol: threadKey(symbol) },
    update: {},
  });
  // Most recent turns, oldest first.
  const prior = (
    await prisma.fundamentalChatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
    })
  ).reverse();
  await prisma.fundamentalChatMessage.create({
    data: { threadId: thread.id, role: "user", content: message, contextSnapshot: { lens: lens?.key ?? null } },
  });

  // The API requires the conversation to start with a user turn and alternate roles.
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of prior) {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (!m.content.trim()) continue;
    if (history.length === 0 && role === "assistant") continue;
    const last = history[history.length - 1];
    if (last && last.role === role) last.content += `\n\n${m.content}`;
    else history.push({ role, content: m.content });
  }
  if (history.length && history[history.length - 1].role === "user") {
    history.push({ role: "assistant", content: "(No reply was recorded for the previous message.)" });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // Browser left mid-answer; finish the turn so the reply is still saved.
        }
      };
      try {
        const { text, toolLog } = await runResearchTurn({ userId, accountId, symbol, profile, lens, emit }, history, message);
        await prisma.fundamentalChatMessage.create({
          data: {
            threadId: thread.id,
            role: "assistant",
            content: text,
            toolEvents: toolLog.length ? (toolLog as unknown as Prisma.InputJsonValue) : undefined,
          },
        });
        emit({ t: "done" });
      } catch (err) {
        console.error("[research chat]", err);
        emit({ t: "error", message: err instanceof Error ? err.message : "Claude request failed" });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
