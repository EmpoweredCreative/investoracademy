import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { DEFAULT_BUCKET_TARGETS } from "@/lib/buckets";
import { maskAccountNumber, schwab } from "@/lib/schwab/client";
import { handleSchwabError } from "@/lib/schwab/errors";

const linkSchema = z.object({
  accounts: z
    .array(
      z.object({
        hash: z.string().min(1),
        name: z.string().min(1).max(60),
      })
    )
    .min(1),
});

/**
 * POST /api/brokers/schwab/link
 * Creates a LIVE_SCHWAB account for each selected Schwab account (or re-links an existing one).
 * The first sync is triggered separately by the guide so progress can be shown.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { accounts } = linkSchema.parse(await req.json());

    const connection = await prisma.brokerConnection.findUnique({
      where: { userId_provider: { userId, provider: "SCHWAB" } },
    });
    if (!connection) return NextResponse.json({ error: "Connect Schwab first." }, { status: 409 });

    const numbers = await schwab.accountNumbers(userId);
    const linked = [];
    for (const a of accounts) {
      const number = numbers.find((n) => n.hashValue === a.hash);
      if (!number) return NextResponse.json({ error: "That Schwab account is not available on this login." }, { status: 400 });

      const existing = await prisma.account.findUnique({ where: { brokerAccountHash: a.hash } });
      if (existing && existing.userId !== userId) {
        return NextResponse.json({ error: "That Schwab account is linked to another user." }, { status: 409 });
      }

      const nameTaken = await prisma.account.findFirst({
        where: { userId, name: a.name, NOT: existing ? { id: existing.id } : undefined },
      });
      const name = nameTaken ? `${a.name} (${maskAccountNumber(number.accountNumber)})` : a.name;

      const account = existing
        ? await prisma.account.update({
            where: { id: existing.id },
            data: { brokerConnectionId: connection.id, archivedAt: null, name },
          })
        : await prisma.account.create({
            data: {
              userId,
              name,
              mode: "LIVE_SCHWAB",
              brokerConnectionId: connection.id,
              brokerAccountHash: a.hash,
              brokerAccountMask: maskAccountNumber(number.accountNumber),
              wheelTargets: { create: DEFAULT_BUCKET_TARGETS },
            },
          });
      linked.push({ id: account.id, name: account.name });
    }

    return NextResponse.json({ linked }, { status: 201 });
  } catch (error) {
    return handleSchwabError(error);
  }
}
