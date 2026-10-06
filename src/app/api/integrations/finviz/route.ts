import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { FinvizError } from "@/lib/finviz/client";
import { connectFinviz, disconnectFinviz, getFinvizStatus } from "@/lib/finviz/credentials";

/** GET — whether the user has connected Finviz Elite (never returns the token). */
export async function GET() {
  try {
    const userId = await requireAuth();
    return NextResponse.json(await getFinvizStatus(userId));
  } catch (error) {
    return handleApiError(error);
  }
}

const putSchema = z.object({ token: z.string().min(1).max(2000) });

/** PUT { token } — verify the token with Finviz and save it encrypted. Accepts an export link too. */
export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { token } = putSchema.parse(await req.json());
    return NextResponse.json(await connectFinviz(userId, token));
  } catch (error) {
    if (error instanceof FinvizError) return NextResponse.json({ error: error.message }, { status: 400 });
    return handleApiError(error);
  }
}

/** DELETE — disconnect Finviz. */
export async function DELETE() {
  try {
    const userId = await requireAuth();
    await disconnectFinviz(userId);
    return NextResponse.json({ connected: false });
  } catch (error) {
    return handleApiError(error);
  }
}
