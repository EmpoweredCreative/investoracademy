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

  if (error instanceof Error && error.message === "NOT_FOUND") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (error instanceof Error && error.message === "INVALID_SYMBOL") {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: error.issues },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    console.error("[API Error]", error.message, error.stack);
    const message = error.message;
    // A dev server started before `prisma generate` lacks newly added models.
    const isPrismaStale =
      message.includes("Cannot read properties of undefined") &&
      /reading '(create|createMany|find\w*|upsert|update\w*|delete\w*|count)'/.test(message);
    return NextResponse.json(
      {
        error: isPrismaStale
          ? "Database client is out of date. Restart the dev server (stop npm run dev, then start again) and retry."
          : message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
