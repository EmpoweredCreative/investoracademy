import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { profileTypeSchema } from "@/lib/foundation/store";

const preferencesSchema = z.object({
  profileType: profileTypeSchema.optional(),
  includeTradingInNetWorth: z.boolean().optional(),
});

const select = { profileType: true, includeTradingInNetWorth: true } as const;

export async function GET() {
  try {
    const userId = await requireAuth();
    return NextResponse.json(await prisma.user.findUniqueOrThrow({ where: { id: userId }, select }));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const data = preferencesSchema.parse(await req.json());
    return NextResponse.json(await prisma.user.update({ where: { id: userId }, data, select }));
  } catch (error) {
    return handleApiError(error);
  }
}
