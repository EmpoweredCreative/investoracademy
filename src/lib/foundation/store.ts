import { z } from "zod";
import { prisma } from "@/lib/db";
import { getLiveQuotes } from "@/lib/marketdata/liveQuotes";
import { ACCOUNT_SNAPSHOT_INCLUDE, buildAccountSnapshot, holdingSymbols } from "@/lib/services/accountSnapshot";
import {
  businessPnl,
  monthRange,
  summarize,
  type BusinessExpenseInput,
  type AssetInput,
  type BillInput,
  type DebtInput,
  type IncomeInput,
  type ProfileType,
} from "./calc";

/** Validation, serialization and loading for Foundation records. All user-scoped. */

const FREQUENCIES = ["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY", "QUARTERLY", "ANNUAL"] as const;
const money = z.coerce.number().min(0).max(1e10);
const optMoney = z.union([money, z.null()]).optional();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const name = z.string().trim().min(1).max(80);

export const profileTypeSchema = z.enum(["EMPLOYEE", "BUSINESS_OWNER", "BOTH"]);

export const incomeSchema = z.object({
  name,
  type: z.enum(["SALARY", "HOURLY", "OWNER_DRAW", "DISTRIBUTION", "SIDE_INCOME", "OTHER"]),
  amount: money,
  netAmount: optMoney,
  frequency: z.enum(FREQUENCIES),
  consistency: z.enum(["STEADY", "VARIABLE"]).default("STEADY"),
  active: z.boolean().default(true),
});

export const billSchema = z.object({
  name,
  category: z.enum(["HOUSING", "UTILITIES", "INSURANCE", "TRANSPORTATION", "SUBSCRIPTIONS", "GROCERIES", "CHILDCARE", "PHONE_INTERNET", "OTHER"]),
  amount: money,
  frequency: z.enum(FREQUENCIES).default("MONTHLY"),
  dueDay: z.union([z.coerce.number().int().min(1).max(31), z.null()]).optional(),
  autopay: z.boolean().default(false),
});

export const debtSchema = z.object({
  lender: name,
  type: z.enum(["MORTGAGE", "HELOC", "AUTO", "PERSONAL", "CREDIT_CARD", "STUDENT", "MEDICAL", "OTHER"]),
  balance: money,
  balanceAsOf: dateStr,
  monthlyPayment: money,
  apr: z.union([z.coerce.number().min(0).max(100), z.null()]).optional(),
  aprIsEstimate: z.boolean().default(false),
  creditLimit: optMoney,
  escrowTaxes: optMoney,
  escrowInsurance: optMoney,
  pmi: optMoney,
  paidOffAt: z.union([z.string().datetime(), z.null()]).optional(),
});

export const assetSchema = z.object({
  name,
  type: z.enum(["HOME", "VEHICLE", "CHECKING", "SAVINGS", "INVESTMENT", "RETIREMENT", "BUSINESS", "OTHER"]),
  value: money,
  valueIsEstimate: z.boolean().default(false),
  asOf: dateStr,
  securesDebtId: z.union([z.string().min(1), z.null()]).optional(),
});

const monthStr = z.string().regex(/^\d{4}-\d{2}$/);

export const businessExpenseSchema = z.object({
  month: monthStr,
  name,
  category: z.enum(["PAYROLL", "CONTRACTORS", "SOFTWARE", "INSURANCE", "PROFESSIONAL", "ADVERTISING", "TRAVEL", "RENT", "OTHER"]),
  amount: money,
  oneTime: z.boolean().default(false),
});

export const businessRevenueSchema = z.object({
  month: monthStr,
  revenue: z.union([money, z.null()]),
});

const num = (d: { toNumber(): number } | null | undefined) => (d == null ? null : d.toNumber());
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Today in the user's timezone, as YYYY-MM-DD. */
export function todayIn(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

// ─── Serializers ─────────────────────────────────────────────

type Row = Record<string, unknown>;

export function serializeIncome(r: Awaited<ReturnType<typeof prisma.incomeSource.findFirstOrThrow>>) {
  return { ...r, amount: r.amount.toNumber(), netAmount: num(r.netAmount) };
}
export function serializeBill(r: Awaited<ReturnType<typeof prisma.bill.findFirstOrThrow>>) {
  return { ...r, amount: r.amount.toNumber() };
}
export function serializeDebt(r: Awaited<ReturnType<typeof prisma.debt.findFirstOrThrow>>) {
  return {
    ...r,
    balance: r.balance.toNumber(),
    balanceAsOf: day(r.balanceAsOf),
    monthlyPayment: r.monthlyPayment.toNumber(),
    apr: num(r.apr),
    creditLimit: num(r.creditLimit),
    escrowTaxes: num(r.escrowTaxes),
    escrowInsurance: num(r.escrowInsurance),
    pmi: num(r.pmi),
    paidOffAt: r.paidOffAt?.toISOString() ?? null,
  };
}
export function serializeBusinessExpense(r: Awaited<ReturnType<typeof prisma.businessExpense.findFirstOrThrow>>) {
  return { ...r, month: day(r.month).slice(0, 7), amount: r.amount.toNumber() };
}
export function serializeAsset(r: Awaited<ReturnType<typeof prisma.asset.findFirstOrThrow>>) {
  return { ...r, value: r.value.toNumber(), asOf: day(r.asOf) };
}

/** Convert validated input into Prisma data (dates as Date). */
export function toData(input: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if ((k === "balanceAsOf" || k === "asOf") && typeof v === "string") out[k] = new Date(v + "T00:00:00.000Z");
    else if (k === "month" && typeof v === "string") out[k] = new Date(v + "-01T00:00:00.000Z");
    else if (k === "paidOffAt" && typeof v === "string") out[k] = new Date(v);
    else out[k] = v;
  }
  return out;
}

// ─── Trader's Corner accounts as assets ──────────────────────

/** Real (non-simulated) investment accounts, valued the same way as Trader's Corner (live quotes). */
async function tradingAccounts(userId: string): Promise<{ assets: AssetInput[]; cashReserves: number }> {
  const accounts = await prisma.account.findMany({
    where: { userId, archivedAt: null, mode: { not: "SIMULATED" } },
    include: ACCOUNT_SNAPSHOT_INCLUDE,
  });
  const quotes = await getLiveQuotes(accounts.flatMap(holdingSymbols));
  const snapshots = accounts.map((a) => buildAccountSnapshot(a, quotes));
  return {
    assets: accounts.map((a, i) => ({
      id: `account:${a.id}`,
      name: `${a.name} (Trader's Corner)`,
      type: "INVESTMENT" as const,
      value: Math.round(snapshots[i].netLiq * 100) / 100,
      valueIsEstimate: false,
      securesDebtId: null,
      // Net liquidation includes stocks. Emergency cash uses cash and the cashflow reserve only.
      excludeFromEmergencyFund: true,
    })),
    cashReserves: Math.round(snapshots.reduce((sum, s) => sum + s.cash + s.reserve, 0) * 100) / 100,
  };
}

// ─── Summary ─────────────────────────────────────────────────

/** Business P&L for the 3 months ending `endMonth` (YYYY-MM). */
async function loadBusiness(userId: string, endMonth: string) {
  const months = monthRange(endMonth, 3);
  const from = new Date(months[0] + "-01T00:00:00.000Z");
  const to = new Date(endMonth + "-01T00:00:00.000Z");
  const [revenueRows, expenseRows] = await Promise.all([
    prisma.businessMonth.findMany({ where: { userId, month: { gte: from, lte: to } } }),
    prisma.businessExpense.findMany({ where: { userId, month: { gte: from, lte: to } }, orderBy: [{ month: "asc" }, { createdAt: "asc" }] }),
  ]);
  const revenue = revenueRows.map((r) => ({ month: day(r.month).slice(0, 7), revenue: r.revenue.toNumber() }));
  const expenses = expenseRows.map(serializeBusinessExpense);
  return { months, revenue, expenses, pnl: businessPnl(months, revenue, expenses as BusinessExpenseInput[]) };
}

export async function loadFoundation(userId: string, opts: { businessEnd?: string } = {}) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { profileType: true, includeTradingInNetWorth: true, timezone: true },
  });
  const [incomes, bills, debts, assets, trading] = await Promise.all([
    prisma.incomeSource.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.bill.findMany({ where: { userId }, orderBy: [{ category: "asc" }, { createdAt: "asc" }] }),
    prisma.debt.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.asset.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    tradingAccounts(userId),
  ]);
  const tradingAssets = user.includeTradingInNetWorth ? trading.assets : [];

  const today = todayIn(user.timezone);
  const hasBusiness = user.profileType === "BUSINESS_OWNER" || user.profileType === "BOTH";
  // The P&L page can look back; the summary's tax reserve always uses the latest 3 months.
  const business = hasBusiness ? await loadBusiness(userId, opts.businessEnd ?? today.slice(0, 7)) : null;
  const latestBusiness =
    business && (!opts.businessEnd || opts.businessEnd === today.slice(0, 7)) ? business : hasBusiness ? await loadBusiness(userId, today.slice(0, 7)) : null;
  const s = {
    incomes: incomes.map(serializeIncome),
    bills: bills.map(serializeBill),
    debts: debts.map(serializeDebt),
    assets: assets.map(serializeAsset),
  };
  const summary = summarize({
    profileType: user.profileType as ProfileType | null,
    incomes: s.incomes as IncomeInput[],
    bills: s.bills as BillInput[],
    debts: s.debts as DebtInput[],
    assets: [...(s.assets as AssetInput[]), ...tradingAssets],
    today,
    businessNetMonthly: latestBusiness && latestBusiness.pnl.monthsWithData > 0 ? latestBusiness.pnl.average.recurringNet : null,
    cashReserves: trading.cashReserves,
  });
  return {
    profile: { type: user.profileType, includeTradingInNetWorth: user.includeTradingInNetWorth },
    today,
    ...s,
    tradingAssets,
    business,
    summary,
  };
}

/** Record this month's net worth once, then return the history (oldest first). */
export async function netWorthHistory(userId: string, today: string, totals: { assets: number; liabilities: number; liquid: number }) {
  const month = new Date(today.slice(0, 7) + "-01T00:00:00.000Z");
  if (totals.assets > 0 || totals.liabilities > 0) {
    await prisma.netWorthSnapshot.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, ...totals },
      // Keep the month's snapshot current until the month ends.
      update: totals,
    });
  }
  const rows = await prisma.netWorthSnapshot.findMany({ where: { userId }, orderBy: { month: "asc" }, take: 36 });
  return rows.map((r) => ({
    month: day(r.month).slice(0, 7),
    assets: r.assets.toNumber(),
    liabilities: r.liabilities.toNumber(),
    netWorth: r.assets.toNumber() - r.liabilities.toNumber(),
  }));
}
