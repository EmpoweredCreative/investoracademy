import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { FinvizError, testToken } from "./client";

/**
 * Each user connects their own Finviz Elite subscription. The token is stored
 * encrypted and only ever decrypted server-side to call Finviz.
 */
const PROVIDER = "finviz";

/** Accepts the bare token or any Finviz Elite export link containing `auth=…`. */
export function extractToken(input: string): string {
  const raw = input.trim();
  const fromUrl = /[?&]auth=([^&#\s]+)/i.exec(raw)?.[1];
  const token = decodeURIComponent(fromUrl ?? raw).trim();
  if (!/^[A-Za-z0-9-]{8,128}$/.test(token)) {
    throw new FinvizError("That doesn't look like a Finviz Elite API token. Paste the token, or an Elite export link that contains auth=….");
  }
  return token;
}

export async function getFinvizStatus(userId: string) {
  const c = await prisma.apiCredential.findUnique({ where: { userId_provider: { userId, provider: PROVIDER } } });
  return { connected: Boolean(c), hint: c?.hint ?? null, verifiedAt: c?.verifiedAt?.toISOString() ?? null };
}

/** The user's decrypted token, or null if they haven't connected Finviz. */
export async function getFinvizToken(userId: string): Promise<string | null> {
  const c = await prisma.apiCredential.findUnique({ where: { userId_provider: { userId, provider: PROVIDER } } });
  if (!c) return null;
  try {
    return decryptSecret(c.secret);
  } catch {
    return null;
  }
}

/** Verify the token against Finviz, then save it encrypted. */
export async function connectFinviz(userId: string, input: string) {
  const token = extractToken(input);
  await testToken(token);
  const data = { secret: encryptSecret(token), hint: token.slice(-4), verifiedAt: new Date() };
  await prisma.apiCredential.upsert({
    where: { userId_provider: { userId, provider: PROVIDER } },
    create: { userId, provider: PROVIDER, ...data },
    update: data,
  });
  return getFinvizStatus(userId);
}

export async function disconnectFinviz(userId: string) {
  await prisma.apiCredential.deleteMany({ where: { userId, provider: PROVIDER } });
}
