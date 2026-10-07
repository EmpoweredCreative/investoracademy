import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { businessRevenueSchema } from "@/lib/foundation/store";

/** PUT — set (or clear, with revenue: null) a month's business revenue. */
export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { month, revenue } = businessRevenueSchema.parse(await req.json());
    const date = new Date(month + "-01T00:00:00.000Z");
    if (revenue == null) {
      await prisma.businessMonth.deleteMany({ where: { userId, month: date } });
    } else {
      await prisma.businessMonth.upsert({
        where: { userId_month: { userId, month: date } },
        create: { userId, month: date, revenue },
        update: { revenue },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
