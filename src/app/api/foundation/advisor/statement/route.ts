import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { AdvisorError, readStatement } from "@/lib/foundation/advisorService";

export const maxDuration = 120;

/** POST multipart { statement } — read a statement image or PDF and propose record updates. The file isn't stored. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const file = (await req.formData()).get("statement");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a statement file." }, { status: 400 });
    const result = await readStatement(userId, {
      type: file.type,
      size: file.size,
      name: file.name.slice(0, 80),
      data: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdvisorError) return NextResponse.json({ error: error.message }, { status: error.status });
    return handleApiError(error);
  }
}
