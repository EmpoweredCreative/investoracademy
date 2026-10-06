import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { inferStrategy, parseOccSymbol } from "../sync";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("parseOccSymbol", () => {
  it("parses a padded OCC symbol", () => {
    const p = parseOccSymbol("AAPL  250718C00210000")!;
    expect(p.underlying).toBe("AAPL");
    expect(p.callPut).toBe("CALL");
    expect(p.strike).toBe(210);
    expect(p.expiration.toISOString().slice(0, 10)).toBe("2025-07-18");
  });

  it("parses fractional strikes and puts", () => {
    const p = parseOccSymbol("SOFI  251219P00012500")!;
    expect(p.callPut).toBe("PUT");
    expect(p.strike).toBe(12.5);
  });

  it("returns null for equities", () => {
    expect(parseOccSymbol("AAPL")).toBeNull();
  });
});

describe("inferStrategy", () => {
  const put = (strike: number, short: boolean) => ({ callPut: "PUT" as const, strike, short });
  const call = (strike: number, short: boolean) => ({ callPut: "CALL" as const, strike, short });

  it("labels a bull put credit spread", () => {
    expect(inferStrategy([put(100, true), put(95, false)], null, 0)).toBe("BULL_PUT_SPREAD");
  });
  it("labels an iron condor vs iron butterfly", () => {
    expect(inferStrategy([put(90, false), put(95, true), call(105, true), call(110, false)], null, 0)).toBe("IRON_CONDOR");
    expect(inferStrategy([put(90, false), put(100, true), call(100, true), call(110, false)], null, 0)).toBe("IRON_BUTTERFLY");
  });
  it("labels a covered call only when 100+ shares are held", () => {
    expect(inferStrategy([call(210, true)], null, 100)).toBe("COVERED_CALL");
    expect(inferStrategy([call(210, true)], null, 0)).toBeNull();
  });
  it("labels a cash-secured put", () => {
    expect(inferStrategy([put(50, true)], null, 0)).toBe("SHORT_PUT");
  });
  it("labels long-dated calls as LEAPs", () => {
    expect(inferStrategy([call(200, false)], new Date(Date.now() + 400 * 86400_000), 0)).toBe("LEAP_CALL");
  });
});

describe("token encryption", () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

  it("round-trips", () => {
    const enc = encryptSecret("refresh-token-123@");
    expect(enc).not.toContain("refresh-token");
    expect(decryptSecret(enc)).toBe("refresh-token-123@");
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptSecret("secret");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
