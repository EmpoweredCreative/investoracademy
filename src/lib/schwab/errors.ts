import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { SchwabApiError, SchwabNotConnectedError } from "./client";
import { SchwabAuthError } from "./oauth";

/** API error handler that maps Schwab failures to actionable responses. */
export function handleSchwabError(error: unknown) {
  if (error instanceof SchwabNotConnectedError) {
    return NextResponse.json({ error: error.message, code: "SCHWAB_RECONNECT" }, { status: 409 });
  }
  if (error instanceof SchwabAuthError) {
    return NextResponse.json({ error: error.message, code: "SCHWAB_AUTH", detail: error.body }, { status: 502 });
  }
  if (error instanceof SchwabApiError) {
    return NextResponse.json({ error: error.message, code: "SCHWAB_API", detail: error.body }, { status: 502 });
  }
  return handleApiError(error);
}
