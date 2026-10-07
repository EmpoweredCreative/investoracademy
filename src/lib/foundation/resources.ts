import type { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assetSchema,
  billSchema,
  businessExpenseSchema,
  debtSchema,
  incomeSchema,
  serializeAsset,
  serializeBill,
  serializeBusinessExpense,
  serializeDebt,
  serializeIncome,
} from "./store";

/**
 * The four Foundation record types behind /api/foundation/[resource].
 * Each delegate is narrowed to the operations the routes use.
 */
interface Delegate {
  findMany(args: object): Promise<unknown[]>;
  findFirst(args: object): Promise<unknown>;
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
  count(args: object): Promise<number>;
}

interface Resource {
  model: Delegate;
  schema: z.ZodObject<z.ZodRawShape>;
  serialize: (row: never) => unknown;
  /** Upper bound per user, to keep lists sane. */
  max: number;
}

export const RESOURCES: Record<string, Resource> = {
  income: { model: prisma.incomeSource as unknown as Delegate, schema: incomeSchema, serialize: serializeIncome, max: 30 },
  bills: { model: prisma.bill as unknown as Delegate, schema: billSchema, serialize: serializeBill, max: 150 },
  debts: { model: prisma.debt as unknown as Delegate, schema: debtSchema, serialize: serializeDebt, max: 60 },
  assets: { model: prisma.asset as unknown as Delegate, schema: assetSchema, serialize: serializeAsset, max: 60 },
  "business-expenses": {
    model: prisma.businessExpense as unknown as Delegate,
    schema: businessExpenseSchema,
    serialize: serializeBusinessExpense,
    max: 1000,
  },
};

export function resourceOr404(name: string): Resource {
  const r = RESOURCES[name];
  if (!r) throw new Error("NOT_FOUND");
  return r;
}

/** An asset can only be linked to the user's own debt. */
export async function assertOwnDebt(userId: string, debtId: string) {
  if (!(await prisma.debt.findFirst({ where: { id: debtId, userId }, select: { id: true } }))) throw new Error("NOT_FOUND");
}
