import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser, normalizeSymbol } from "@/lib/fundamentals/accountAccess";
import { fundamentalChatPostSchema } from "@/lib/validations";
import { scoreAllRatios, countByStatus } from "@/lib/fundamentals/ratioBands";
import { snapshotToMetrics } from "@/lib/fundamentals/yahooFundamentals";
import {
  buildFundamentalContextBlock,
  buildFundamentalSystemPrompt,
} from "@/lib/fundamentals/aiContext";

async function getSymbolContext(accountId: string, symbol: string) {
  const [snapshot, research, watchlistItem] = await Promise.all([
    prisma.fundamentalSnapshot.findUnique({
      where: { accountId_symbol: { accountId, symbol } },
    }),
    prisma.fundamentalResearch.findUnique({
      where: { accountId_symbol: { accountId, symbol } },
    }),
    prisma.fundamentalWatchlistItem.findUnique({
      where: { accountId_symbol: { accountId, symbol } },
    }),
  ]);

  if (watchlistItem?.yahooFetchStatus !== "READY" || !snapshot) {
    return null;
  }

  const metrics = snapshotToMetrics(snapshot);
  const ratios = scoreAllRatios(metrics);

  return {
    snapshot,
    ratios,
    ryg: countByStatus(ratios),
    research,
    contextBlock: buildFundamentalContextBlock({
      symbol,
      ratios,
      price: snapshot.price ? parseFloat(snapshot.price.toString()) : null,
      nextEarningsDate:
        snapshot.nextEarningsDate?.toISOString().slice(0, 10) ?? null,
      verdict: research?.verdict ?? null,
      notes: research?.notes ?? null,
    }),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; symbol: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId, symbol: rawSymbol } = await params;
    await requireAccountForUser(accountId, userId);
    const symbol = normalizeSymbol(decodeURIComponent(rawSymbol));

    const thread = await prisma.fundamentalChatThread.findUnique({
      where: { accountId_symbol: { accountId, symbol } },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({
      messages:
        thread?.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })) ?? [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; symbol: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId, symbol: rawSymbol } = await params;
    await requireAccountForUser(accountId, userId);
    const symbol = normalizeSymbol(decodeURIComponent(rawSymbol));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI chat is not configured (OPENAI_API_KEY)" },
        { status: 503 }
      );
    }

    const ctx = await getSymbolContext(accountId, symbol);
    if (!ctx) {
      return NextResponse.json(
        { error: "Fundamentals not ready. Wait for Yahoo fetch to complete." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { message } = fundamentalChatPostSchema.parse(body);

    const thread = await prisma.fundamentalChatThread.upsert({
      where: { accountId_symbol: { accountId, symbol } },
      create: { accountId, symbol },
      update: {},
    });

    const priorMessages = await prisma.fundamentalChatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    await prisma.fundamentalChatMessage.create({
      data: { threadId: thread.id, role: "user", content: message },
    });

    const openai = new OpenAI({ apiKey });
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: buildFundamentalSystemPrompt() },
      {
        role: "system",
        content: `Current fundamental context:\n${ctx.contextBlock}`,
      },
      ...priorMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      stream: true,
      max_tokens: 1500,
    });

    const encoder = new TextEncoder();
    let fullAssistant = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              fullAssistant += text;
              controller.enqueue(encoder.encode(text));
            }
          }
          await prisma.fundamentalChatMessage.create({
            data: {
              threadId: thread.id,
              role: "assistant",
              content: fullAssistant,
              contextSnapshot: {
                ryg: ctx.ryg,
                ratios: ctx.ratios.map((r) => ({
                  name: r.name,
                  value: r.formattedValue,
                  status: r.score.status,
                  label: r.score.label,
                })),
              },
            },
          });
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; symbol: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId, symbol: rawSymbol } = await params;
    await requireAccountForUser(accountId, userId);
    const symbol = normalizeSymbol(decodeURIComponent(rawSymbol));

    await prisma.fundamentalChatThread.deleteMany({
      where: { accountId, symbol },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
