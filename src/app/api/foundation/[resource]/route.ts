import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { assertOwnDebt, resourceOr404 } from "@/lib/foundation/resources";
import { toData } from "@/lib/foundation/store";

type Params = { params: Promise<{ resource: string }> };

/** GET — list the user's income sources, bills, debts or assets. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireAuth();
    const r = resourceOr404((await params).resource);
    const rows = await r.model.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ items: rows.map((row) => r.serialize(row as never)) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — add one. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireAuth();
    const r = resourceOr404((await params).resource);
    const input = r.schema.parse(await req.json());
    if ((await r.model.count({ where: { userId } })) >= r.max) {
      return NextResponse.json({ error: `You can add up to ${r.max} of these.` }, { status: 400 });
    }
    if (typeof input.securesDebtId === "string") await assertOwnDebt(userId, input.securesDebtId);
    const row = await r.model.create({ data: { userId, ...toData(input) } });
    return NextResponse.json({ item: r.serialize(row as never) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
