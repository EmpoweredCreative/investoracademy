import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { assertOwnDebt, resourceOr404 } from "@/lib/foundation/resources";
import { toData } from "@/lib/foundation/store";

type Params = { params: Promise<{ resource: string; id: string }> };

async function owned(params: Params["params"]) {
  const userId = await requireAuth();
  const { resource, id } = await params;
  const r = resourceOr404(resource);
  const row = await r.model.findFirst({ where: { id, userId } });
  if (!row) throw new Error("NOT_FOUND");
  return { userId, r, id };
}

/** PATCH — update any subset of fields. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { userId, r, id } = await owned(params);
    const input = r.schema.partial().parse(await req.json());
    if (typeof input.securesDebtId === "string") await assertOwnDebt(userId, input.securesDebtId);
    const row = await r.model.update({ where: { id }, data: toData(input) });
    return NextResponse.json({ item: r.serialize(row as never) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { r, id } = await owned(params);
    await r.model.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
