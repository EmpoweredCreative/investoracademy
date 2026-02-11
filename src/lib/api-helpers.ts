import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";

/**
 * Get the authenticated user ID from the session.
 * Returns null if not authenticated.
 */
export async function getAuthUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Require authentication and return user ID.
 * Throws a NextResponse 401 if not authenticated.
 */
export async function requireAuth(): Promise<string> {
  const userId = await getAuthUserId();
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}

/**
 * Standard error response handler.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: error.issues },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    console.error("[API Error]", error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
