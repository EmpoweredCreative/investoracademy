import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  SCHWAB_API,
  SchwabAuthError,
  refreshAccessToken,
  type SchwabTokens,
} from "./oauth";
import type { SchwabAccount, SchwabAccountNumber, SchwabTransaction } from "./types";

const REFRESH_SKEW_MS = 60_000;
const EXPIRING_WINDOW_MS = 24 * 3600_000;

export class SchwabNotConnectedError extends Error {
  constructor(message = "Schwab is not connected. Reconnect from the connection guide.") {
    super(message);
    this.name = "SchwabNotConnectedError";
  }
}

/** Save freshly issued tokens (initial authorization). */
export async function saveNewConnection(userId: string, tokens: SchwabTokens) {
  const now = Date.now();
  const data = {
    accessTokenEnc: encryptSecret(tokens.access_token),
    refreshTokenEnc: encryptSecret(tokens.refresh_token),
    accessExpiresAt: new Date(now + (tokens.expires_in ? tokens.expires_in * 1000 : ACCESS_TOKEN_TTL_MS)),
    refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    status: "ACTIVE" as const,
    lastError: null,
  };
  return prisma.brokerConnection.upsert({
    where: { userId_provider: { userId, provider: "SCHWAB" } },
    create: { userId, provider: "SCHWAB", ...data },
    update: data,
  });
}

/** In-process lock so concurrent requests don't race a refresh. */
const refreshing = new Map<string, Promise<string>>();

async function getAccessToken(userId: string): Promise<string> {
  const conn = await prisma.brokerConnection.findUnique({
    where: { userId_provider: { userId, provider: "SCHWAB" } },
  });
  if (!conn) throw new SchwabNotConnectedError();
  if (conn.refreshExpiresAt.getTime() <= Date.now() || conn.status === "EXPIRED") {
    if (conn.status !== "EXPIRED") {
      await prisma.brokerConnection.update({ where: { id: conn.id }, data: { status: "EXPIRED" } });
    }
    throw new SchwabNotConnectedError("Your Schwab authorization expired (7-day limit). Reconnect to resume syncing.");
  }

  if (conn.accessExpiresAt.getTime() - REFRESH_SKEW_MS > Date.now()) {
    return decryptSecret(conn.accessTokenEnc);
  }

  const pending = refreshing.get(conn.id);
  if (pending) return pending;

  const job = (async () => {
    try {
      const tokens = await refreshAccessToken(decryptSecret(conn.refreshTokenEnc));
      const expiring = conn.refreshExpiresAt.getTime() - Date.now() < EXPIRING_WINDOW_MS;
      await prisma.brokerConnection.update({
        where: { id: conn.id },
        data: {
          accessTokenEnc: encryptSecret(tokens.access_token),
          // Schwab returns the same refresh token; keep its original 7-day expiry.
          refreshTokenEnc: encryptSecret(tokens.refresh_token ?? decryptSecret(conn.refreshTokenEnc)),
          accessExpiresAt: new Date(Date.now() + (tokens.expires_in ? tokens.expires_in * 1000 : ACCESS_TOKEN_TTL_MS)),
          status: expiring ? "EXPIRING" : "ACTIVE",
          lastError: null,
        },
      });
      return tokens.access_token;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const invalid = err instanceof SchwabAuthError && (err.status === 400 || err.status === 401);
      await prisma.brokerConnection.update({
        where: { id: conn.id },
        data: { status: invalid ? "EXPIRED" : "ERROR", lastError: message },
      });
      if (invalid) throw new SchwabNotConnectedError("Schwab rejected the saved authorization. Reconnect to resume syncing.");
      throw err;
    } finally {
      refreshing.delete(conn.id);
    }
  })();
  refreshing.set(conn.id, job);
  return job;
}

export class SchwabApiError extends Error {
  constructor(message: string, public status: number, public body: string) {
    super(message);
    this.name = "SchwabApiError";
  }
}

/** Authenticated GET against the Schwab API with one retry after a token refresh on 401. */
export async function schwabGet<T>(userId: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${SCHWAB_API}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(userId);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) {
      // Force a refresh on the next loop.
      await prisma.brokerConnection.updateMany({
        where: { userId, provider: "SCHWAB" },
        data: { accessExpiresAt: new Date(0) },
      });
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new SchwabApiError(`Schwab API ${path} failed (${res.status})`, res.status, text.slice(0, 500));
    return (text ? JSON.parse(text) : null) as T;
  }
  throw new SchwabApiError(`Schwab API ${path} unauthorized`, 401, "");
}

export const schwab = {
  accountNumbers: (userId: string) => schwabGet<SchwabAccountNumber[]>(userId, "/trader/v1/accounts/accountNumbers"),
  accounts: (userId: string) => schwabGet<SchwabAccount[]>(userId, "/trader/v1/accounts", { fields: "positions" }),
  account: (userId: string, hash: string) =>
    schwabGet<SchwabAccount>(userId, `/trader/v1/accounts/${encodeURIComponent(hash)}`, { fields: "positions" }),
  transactions: (userId: string, hash: string, start: Date, end: Date, types: string) =>
    schwabGet<SchwabTransaction[]>(userId, `/trader/v1/accounts/${encodeURIComponent(hash)}/transactions`, {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      types,
    }),
};

export function maskAccountNumber(n: string) {
  return `••••${n.slice(-4)}`;
}
