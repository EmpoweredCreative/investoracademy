import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { buildAuthorizeUrl, isSchwabConfigured } from "@/lib/schwab/oauth";
import { handleSchwabError } from "@/lib/schwab/errors";

const STATE_COOKIE = "schwab_oauth_state";

/**
 * GET /api/brokers/schwab/connect
 * Starts OAuth: stores a CSRF state cookie and redirects to Schwab's login.
 */
export async function GET() {
  try {
    await requireAuth();
    if (!isSchwabConfigured()) {
      return NextResponse.json(
        { error: "Schwab is not configured on the server. Add SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, SCHWAB_REDIRECT_URI and TOKEN_ENCRYPTION_KEY." },
        { status: 503 }
      );
    }
    const state = randomBytes(24).toString("base64url");
    const res = NextResponse.redirect(buildAuthorizeUrl(state));
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/brokers/schwab",
      maxAge: 10 * 60,
    });
    return res;
  } catch (error) {
    return handleSchwabError(error);
  }
}
