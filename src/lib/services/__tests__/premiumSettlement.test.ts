import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { computeNrop, reopenOptionInstance, settleOptionInstance } from "../premiumSettlement";
import { recordPremiumFundedPurchase } from "../coreBucket";

const D = (n: number) => new Prisma.Decimal(n);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows keep the fake DB short
type Row = Record<string, any>;

/** Minimal in-memory stand-in for the Prisma transaction client used by the settlement code. */
function fakeDb(seed: {
  mode?: "ACCUMULATE" | "REDUCE_BASIS" | "INCOME" | null;
  shareGoal?: number | null;
  category?: "CORE" | "SPECULATION" | "RISK_FREE_MONEY";
  longShort?: "SHORT" | "LONG";
  credit?: number;
  debit?: number;
  fee?: number;
  price?: number | null;
  lots?: { qty: number; cost: number }[];
}) {
  let seq = 0;
  const id = () => `id${++seq}`;
  const underlying = {
    id: "u1",
    symbol: "AAPL",
    currentPrice: seed.price === null ? null : D(seed.price ?? 200),
    premiumPolicy: null,
    wheelClassification: { category: seed.category ?? "CORE" },
  };
  const instance: Row = {
    id: "i1",
    accountId: "a1",
    underlyingId: "u1",
    longShort: seed.longShort ?? "SHORT",
    callPut: "CALL",
    strike: D(210),
    status: "OPEN",
    wheelCategoryOverride: null,
    premiumPolicyOverride: null,
  };
  const ledger: Row[] = [
    { type: "PREMIUM_CREDIT", amount: D(seed.credit ?? 300) },
    ...(seed.debit ? [{ type: "PREMIUM_DEBIT", amount: D(seed.debit) }] : []),
    ...(seed.fee ? [{ type: "FEE", amount: D(seed.fee) }] : []),
  ];
  const lots: Row[] = (seed.lots ?? [{ qty: 100, cost: 15000 }]).map((l, i) => ({
    id: `lot${i}`,
    accountId: "a1",
    underlyingId: "u1",
    quantity: D(l.qty),
    remaining: D(l.qty),
    costBasis: D(l.cost),
    premiumReduction: D(0),
    premiumFundedQty: D(0),
    fundedBy: "CASH",
    acquiredAt: new Date(2025, 0, i + 1),
  }));
  const plans: Row[] =
    seed.mode === null
      ? []
      : [
          {
            id: "p1",
            underlyingId: "u1",
            mode: seed.mode ?? "ACCUMULATE",
            shareGoal: seed.shareGoal ?? null,
            modeAfterGoal: "INCOME",
            reinvestThresholdShares: 1,
          },
        ];
  const bucket: Row[] = [];
  const signals: Row[] = [];
  const notifications: Row[] = [];

  const sum = (rows: Row[], key: string) => rows.reduce((s, r) => s.plus(r[key]), D(0));

  const tx = {
    strategyInstance: {
      findUniqueOrThrow: async () => ({
        ...instance,
        ledgerEntries: ledger,
        underlying,
        account: { userId: "user1", defaultPolicy: null },
      }),
      update: async ({ data }: Row) => Object.assign(instance, data),
    },
    premiumBucketEntry: {
      findMany: async ({ where }: Row) => bucket.filter((b) => b.strategyInstanceId === where.strategyInstanceId),
      deleteMany: async ({ where }: Row) => {
        for (let i = bucket.length - 1; i >= 0; i--) {
          if (bucket[i].strategyInstanceId === where.strategyInstanceId) bucket.splice(i, 1);
        }
      },
      create: async ({ data }: Row) => {
        const row = { id: id(), ...data, amount: D(data.amount) };
        bucket.push(row);
        return row;
      },
      aggregate: async () => ({ _sum: { amount: bucket.length ? sum(bucket, "amount") : null } }),
    },
    reinvestSignal: {
      deleteMany: async () => {},
      updateMany: async () => {},
      findMany: async () => signals.filter((s) => ["CREATED", "NOTIFIED", "SNOOZED"].includes(s.status)),
      update: async ({ where, data }: Row) => Object.assign(signals.find((s) => s.id === where.id)!, data),
      upsert: async ({ create }: Row) => {
        const row = { id: id(), status: "CREATED", ...create };
        signals.push(row);
        return row;
      },
    },
    corePlan: {
      findUnique: async () => plans[0] ?? null,
      update: async ({ data }: Row) => Object.assign(plans[0], data),
    },
    stockLot: {
      aggregate: async () => ({ _sum: { remaining: sum(lots, "remaining") } }),
      findMany: async () => lots.filter((l) => l.remaining.gt(0)),
      update: async ({ where, data }: Row) => Object.assign(lots.find((l) => l.id === where.id)!, data),
    },
    notification: {
      create: async ({ data }: Row) => notifications.push(data),
    },
  };

  return { tx: tx as unknown as Prisma.TransactionClient, instance, lots, plans, bucket, signals, notifications };
}

const settle = (tx: Prisma.TransactionClient) =>
  settleOptionInstance(tx, { instanceId: "i1", reason: "CLOSED", finalizedAt: new Date(2025, 5, 1) });

const balance = (bucket: Row[]) => bucket.reduce((s, b) => s + b.amount.toNumber(), 0);

describe("computeNrop", () => {
  it("is credits minus debits minus fees", () => {
    const nrop = computeNrop([
      { type: "PREMIUM_CREDIT", amount: D(300) },
      { type: "PREMIUM_DEBIT", amount: D(50) },
      { type: "FEE", amount: D(1.3) },
    ] as never);
    expect(nrop.toNumber()).toBeCloseTo(248.7);
  });
});

describe("settleOptionInstance", () => {
  it("finalizes the instance with NROP", async () => {
    const db = fakeDb({ credit: 300, debit: 50, fee: 2 });
    const result = await settle(db.tx);
    expect(result.nrop.toNumber()).toBe(248);
    expect(db.instance.status).toBe("FINALIZED");
    expect(db.instance.realizedOptionProfit.toNumber()).toBe(248);
  });

  it("ACCUMULATE credits the bucket and suggests a reinvest when it can buy a share", async () => {
    const db = fakeDb({ mode: "ACCUMULATE", credit: 450, price: 200 });
    const result = await settle(db.tx);
    expect(result.coreMode).toBe("ACCUMULATE");
    expect(balance(db.bucket)).toBe(450);
    expect(result.reinvestSuggestedShares).toBe(2);
    expect(db.signals).toHaveLength(1);
    expect(db.lots[0].premiumReduction.toNumber()).toBe(0);
  });

  it("ACCUMULATE holds premium without a signal when the bucket can't buy a share yet", async () => {
    const db = fakeDb({ mode: "ACCUMULATE", credit: 120, price: 200 });
    const result = await settle(db.tx);
    expect(balance(db.bucket)).toBe(120);
    expect(result.reinvestSuggestedShares).toBeNull();
    expect(db.signals).toHaveLength(0);
  });

  it("REDUCE_BASIS lowers lot cost basis and nets the bucket to zero", async () => {
    const db = fakeDb({ mode: "REDUCE_BASIS", credit: 300 });
    await settle(db.tx);
    expect(db.lots[0].premiumReduction.toNumber()).toBe(300);
    expect(balance(db.bucket)).toBe(0);
    expect(db.bucket.map((b) => b.kind)).toEqual(["PREMIUM_IN", "BASIS_APPLIED"]);
  });

  it("INCOME releases premium to cash", async () => {
    const db = fakeDb({ mode: "INCOME", credit: 300 });
    await settle(db.tx);
    expect(db.bucket.map((b) => b.kind)).toEqual(["PREMIUM_IN", "CASH_OUT"]);
    expect(balance(db.bucket)).toBe(0);
    expect(db.lots[0].premiumReduction.toNumber()).toBe(0);
  });

  it("switches to the after-goal mode once the share goal is reached", async () => {
    const db = fakeDb({ mode: "ACCUMULATE", shareGoal: 100, credit: 300 });
    const result = await settle(db.tx);
    expect(result.coreMode).toBe("INCOME");
    expect(db.plans[0].mode).toBe("INCOME");
    expect(db.notifications).toHaveLength(1);
  });

  it("leaves speculation premium alone", async () => {
    const db = fakeDb({ category: "SPECULATION", credit: 300 });
    const result = await settle(db.tx);
    expect(result.coreMode).toBeNull();
    expect(db.bucket).toHaveLength(0);
  });

  it("does not route long options even in the core bucket", async () => {
    const db = fakeDb({ longShort: "LONG", credit: 500 });
    const result = await settle(db.tx);
    expect(result.coreMode).toBeNull();
    expect(db.bucket).toHaveLength(0);
  });

  it("a losing core trade reduces an accumulating bucket but never raises basis", async () => {
    const acc = fakeDb({ mode: "ACCUMULATE", credit: 100, debit: 250 });
    await settle(acc.tx);
    expect(balance(acc.bucket)).toBe(-150);

    const basis = fakeDb({ mode: "REDUCE_BASIS", credit: 100, debit: 250 });
    await settle(basis.tx);
    expect(basis.bucket).toHaveLength(0);
    expect(basis.lots[0].premiumReduction.toNumber()).toBe(0);
  });

  it("is idempotent when settled twice (edited close)", async () => {
    const db = fakeDb({ mode: "REDUCE_BASIS", credit: 300 });
    await settle(db.tx);
    await settle(db.tx);
    expect(db.lots[0].premiumReduction.toNumber()).toBe(300);
    expect(db.bucket).toHaveLength(2);
  });

  it("re-opening reverses basis reduction and clears the bucket", async () => {
    const db = fakeDb({ mode: "REDUCE_BASIS", credit: 300 });
    await settle(db.tx);
    await reopenOptionInstance(db.tx, "i1");
    expect(db.lots[0].premiumReduction.toNumber()).toBe(0);
    expect(db.bucket).toHaveLength(0);
    expect(db.instance.status).toBe("OPEN");
  });
});

describe("recordPremiumFundedPurchase", () => {
  it("draws the bucket and tags the lot as premium-funded", async () => {
    const db = fakeDb({ mode: "ACCUMULATE", credit: 450, price: 200 });
    await settle(db.tx);
    db.lots.push({
      id: "newlot",
      accountId: "a1",
      underlyingId: "u1",
      quantity: D(2),
      remaining: D(2),
      costBasis: D(400),
      premiumReduction: D(0),
      premiumFundedQty: D(0),
      fundedBy: "CASH",
    });
    const { drawn } = await recordPremiumFundedPurchase(db.tx, {
      accountId: "a1",
      underlyingId: "u1",
      lotId: "newlot",
      quantity: 2,
      price: 200,
      totalCost: D(400),
      occurredAt: new Date(),
    });
    expect(drawn.toNumber()).toBe(400);
    expect(balance(db.bucket)).toBe(50);
    const lot = db.lots.find((l) => l.id === "newlot")!;
    expect(lot.fundedBy).toBe("PREMIUM");
    expect(lot.premiumFundedQty.toNumber()).toBe(2);
    expect(db.signals[0].status).toBe("COMPLETED");
  });

  it("marks a purchase bigger than the bucket as MIXED", async () => {
    const db = fakeDb({ mode: "ACCUMULATE", credit: 250, price: 200 });
    await settle(db.tx);
    db.lots.push({ id: "big", quantity: D(3), remaining: D(3), premiumFundedQty: D(0), fundedBy: "CASH" });
    await recordPremiumFundedPurchase(db.tx, {
      accountId: "a1",
      underlyingId: "u1",
      lotId: "big",
      quantity: 3,
      price: 200,
      totalCost: D(600),
      occurredAt: new Date(),
    });
    const lot = db.lots.find((l) => l.id === "big")!;
    expect(lot.fundedBy).toBe("MIXED");
    expect(lot.premiumFundedQty.toNumber()).toBe(1.25);
    expect(balance(db.bucket)).toBe(0);
  });
});
