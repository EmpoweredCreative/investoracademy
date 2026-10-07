import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { isAdmin, monthlySpend } from "@/lib/foundation/advisorService";

/** GET — advisor spend on the app's key this month, for emails listed in ADMIN_EMAILS. */
export async function GET() {
  try {
    const userId = await requireAuth();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    if (!isAdmin(user.email)) return NextResponse.json({ admin: false });
    return NextResponse.json({ admin: true, ...(await monthlySpend()) });
  } catch (error) {
    return handleApiError(error);
  }
}
