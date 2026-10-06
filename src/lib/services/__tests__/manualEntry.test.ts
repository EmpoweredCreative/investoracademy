import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const ledgerCreates: Record<string, unknown>[] = [];
const cashAdjustments: number[] = [];

const tx = {
  underlying: { upsert: vi.fn(async () => ({ id: "u1" })) },
  strategyInstance: { create: vi.fn(async () => ({ id: "i1" })) },
  ledgerEntry: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      ledgerCreates.push(data);
      return data;
    }),
  },
  journalTrade: { create: vi.fn(async () => ({ id: "j1" })), update: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
vi.mock("../disciplineEngine", () => ({
  getEnvironmentSnapshotForTrade: async () => ({
    marketEnvironmentAtEntry: null,
    environmentScoreAtEntry: null,
    humanAIAlignmentAtEntry: null,
    routineCompletedAtEntry: null,
  }),
}));
vi.mock("../cashTracker", () => ({
  adjustCashBalance: async (_tx: unknown, _id: string, amount: Prisma.Decimal) => {
    cashAdjustments.push(amount.toNumber());
  },
}));

import { processOptionEntry } from "../manualEntry";

describe("processOptionEntry (opening)", () => {
  beforeEach(() => {
    ledgerCreates.length = 0;
    cashAdjustments.length = 0;
  });

  it("books one premium credit, one fee, and one net cash change for an STO", async () => {
    await processOptionEntry({
      accountId: "a1",
      symbol: "AAPL",
      action: "STO",
      callPut: "CALL",
      strike: 210,
      expiration: new Date("2025-07-18"),
      quantity: 2,
      price: 1.5,
      fees: 1.3,
      occurredAt: new Date("2025-06-01"),
    });

    const types = ledgerCreates.map((e) => e.type);
    expect(types).toEqual(["PREMIUM_CREDIT", "FEE"]);
    expect((ledgerCreates[0].amount as Prisma.Decimal).toNumber()).toBe(300);
    expect(cashAdjustments).toEqual([298.7]);
  });

  it("books one premium debit and charges fees for a BTO", async () => {
    await processOptionEntry({
      accountId: "a1",
      symbol: "AAPL",
      action: "BTO",
      callPut: "PUT",
      strike: 190,
      expiration: new Date("2025-07-18"),
      quantity: 1,
      price: 2,
      fees: 0.65,
      occurredAt: new Date("2025-06-01"),
    });

    expect(ledgerCreates.map((e) => e.type)).toEqual(["PREMIUM_DEBIT", "FEE"]);
    expect(cashAdjustments).toEqual([-200.65]);
  });
});
