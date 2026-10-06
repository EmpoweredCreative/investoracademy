import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { exchangeCode } from "@/lib/schwab/oauth";
import { saveNewConnection } from "@/lib/schwab/client";

const STATE_COOKIE = "schwab_oauth_state";

/**
 * GET /api/brokers/schwab/callback?code=…&state=…
 * Schwab redirects here after login/consent. Exchanges the code and stores encrypted tokens.
 */
export async function GET(req: NextRequest) {
  const guide = new URL("/connect/schwab", req.nextUrl.origin);
  const fail = (reason: string) => {
    guide.searchParams.set("error", reason);
    const res = NextResponse.redirect(guide);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/brokers/schwab" });
    return res;
  };

  try {
    const userId = await requireAuth();
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const expected = req.cookies.get(STATE_COOKIE)?.value;

    if (req.nextUrl.searchParams.get("error")) return fail("Schwab login was cancelled or denied.");
    if (!code) return fail("Schwab did not return an authorization code.");
    if (!state || !expected || state !== expected) {
      return fail("Security check failed (state mismatch). Start the connection again from this same address.");
    }

    // searchParams already URL-decodes the code (Schwab codes end in "%40" → "@").
    const tokens = await exchangeCode(code);
    await saveNewConnection(userId, tokens);

    guide.searchParams.set("step", "accounts");
    const res = NextResponse.redirect(guide);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/brokers/schwab" });
    return res;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
    }
    console.error("[schwab callback]", error);
    return fail(error instanceof Error ? error.message : "Could not complete the Schwab connection.");
  }
}
