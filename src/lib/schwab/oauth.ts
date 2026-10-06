/**
 * Schwab Trader API OAuth 2.0 (authorization-code flow).
 * Access tokens last 30 minutes; refresh tokens last 7 days and cannot be extended,
 * so the user must re-authorize weekly.
 */
export const SCHWAB_API = "https://api.schwabapi.com";
export const ACCESS_TOKEN_TTL_MS = 30 * 60_000;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 3600_000;

export interface SchwabTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string;
}

export class SchwabAuthError extends Error {
  constructor(message: string, public status?: number, public body?: string) {
    super(message);
    this.name = "SchwabAuthError";
  }
}

function config() {
  const clientId = process.env.SCHWAB_CLIENT_ID;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
  const redirectUri = process.env.SCHWAB_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new SchwabAuthError("Schwab is not configured: set SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET and SCHWAB_REDIRECT_URI");
  }
  return { clientId, clientSecret, redirectUri };
}

export function isSchwabConfigured() {
  return Boolean(
    process.env.SCHWAB_CLIENT_ID &&
      process.env.SCHWAB_CLIENT_SECRET &&
      process.env.SCHWAB_REDIRECT_URI &&
      process.env.TOKEN_ENCRYPTION_KEY
  );
}

export function buildAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = config();
  const url = new URL(`${SCHWAB_API}/v1/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(body: Record<string, string>): Promise<SchwabTokens> {
  const { clientId, clientSecret } = config();
  const res = await fetch(`${SCHWAB_API}/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new SchwabAuthError(`Schwab token request failed (${res.status})`, res.status, text.slice(0, 500));
  }
  return JSON.parse(text) as SchwabTokens;
}

export function exchangeCode(code: string) {
  const { redirectUri } = config();
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshAccessToken(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}
