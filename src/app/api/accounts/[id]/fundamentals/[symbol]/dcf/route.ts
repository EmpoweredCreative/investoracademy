import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser, normalizeSymbol } from "@/lib/fundamentals/accountAccess";
import { dcfAssumptionsSchema } from "@/lib/fundamentals/dcf";
import { getDcfContext, saveDcfModel } from "@/lib/fundamentals/dcfService";

/** GET — annual history, suggested assumptions and saved DCF models. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; symbol: string }> }) {
  try {
    const userId = await requireAuth();
    const { id: accountId, symbol: raw } = await params;
    await requireAccountForUser(accountId, userId);
    return NextResponse.json(await getDcfContext(accountId, normalizeSymbol(decodeURIComponent(raw))));
  } catch (error) {
    return handleApiError(error);
  }
}

const saveSchema = z.object({ assumptions: dcfAssumptionsSchema, name: z.string().max(60).nullable().optional() });

/** POST — save a DCF run (its margin of safety feeds the criteria score). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; symbol: string }> }) {
  try {
    const userId = await requireAuth();
    const { id: accountId, symbol: raw } = await params;
    await requireAccountForUser(accountId, userId);
    const { assumptions, name } = saveSchema.parse(await req.json());
    const model = await saveDcfModel(accountId, normalizeSymbol(decodeURIComponent(raw)), assumptions, { name });
    return NextResponse.json({ id: model.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Terminal growth")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
