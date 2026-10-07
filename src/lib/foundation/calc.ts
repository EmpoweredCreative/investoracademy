/**
 * Foundation calculations. Pure functions on plain numbers so the pages, the
 * summary API and (later) the advisor all produce the same figures.
 */

export type ProfileType = "EMPLOYEE" | "BUSINESS_OWNER" | "BOTH";
export type Frequency = "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
export type IncomeType = "SALARY" | "HOURLY" | "OWNER_DRAW" | "DISTRIBUTION" | "SIDE_INCOME" | "OTHER";
export type DebtType = "MORTGAGE" | "HELOC" | "AUTO" | "PERSONAL" | "CREDIT_CARD" | "STUDENT" | "MEDICAL" | "OTHER";
export type AssetType = "HOME" | "VEHICLE" | "CHECKING" | "SAVINGS" | "INVESTMENT" | "RETIREMENT" | "BUSINESS" | "OTHER";

export interface IncomeInput {
  id: string;
  name: string;
  type: IncomeType;
  amount: number; // gross per period
  netAmount: number | null; // take-home per period
  frequency: Frequency;
  active: boolean;
}

export interface BillInput {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: Frequency;
}

export interface DebtInput {
  id: string;
  lender: string;
  type: DebtType;
  balance: number;
  balanceAsOf: string; // YYYY-MM-DD
  monthlyPayment: number; // principal & interest for mortgages
  apr: number | null; // annual %
  aprIsEstimate: boolean;
  creditLimit: number | null;
  escrowTaxes: number | null;
  escrowInsurance: number | null;
  pmi: number | null;
  paidOffAt: string | null;
}

export interface AssetInput {
  id: string;
  name: string;
  type: AssetType;
  value: number;
  valueIsEstimate: boolean;
  securesDebtId: string | null;
}

// ─── Basics ──────────────────────────────────────────────────

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  SEMIMONTHLY: 24,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUAL: 1,
};

/** Convert a per-period amount to a monthly average (e.g. a quarterly water bill). */
export const monthly = (amount: number, frequency: Frequency) => (amount * PERIODS_PER_YEAR[frequency]) / 12;

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Typical APRs used when someone picks "estimate it for me" (always flagged as an estimate). */
export const TYPICAL_APR: Record<DebtType, number> = {
  MORTGAGE: 6.5,
  HELOC: 8.5,
  AUTO: 7.5,
  PERSONAL: 12,
  CREDIT_CARD: 22,
  STUDENT: 6,
  MEDICAL: 0,
  OTHER: 10,
};

/** Business income types: owner draws and distributions. */
export const BUSINESS_INCOME_TYPES: IncomeType[] = ["OWNER_DRAW", "DISTRIBUTION"];

/** Estimated tax set-aside on business income (confirm with an accountant). */
export const TAX_RESERVE_RATE = 0.25;

/** Months of expenses an emergency fund should cover. */
export const EMERGENCY_FUND_MONTHS = 3;

// ─── Debt math ───────────────────────────────────────────────

export const monthlyRate = (aprPct: number) => aprPct / 100 / 12;

/** One month's interest at the current balance. */
export const monthlyInterest = (balance: number, aprPct: number) => balance * monthlyRate(aprPct);

/** Max months simulated (50 years); anything longer counts as "never". */
const MAX_MONTHS = 600;

export interface Amortization {
  /** Months to pay off, or null if the payment never pays it off. */
  months: number | null;
  totalInterest: number | null;
  /** Interest over the next 12 months (or until payoff). */
  firstYearInterest: number;
}

/** Pay a balance down with a fixed monthly payment. */
export function amortize(balance: number, aprPct: number, payment: number): Amortization {
  const r = monthlyRate(aprPct);
  let bal = balance;
  let total = 0;
  let firstYear = 0;
  for (let m = 1; m <= MAX_MONTHS; m++) {
    // A small leftover (under 1% of a payment) is payment rounding the lender settles in the final payment.
    if (bal < Math.max(1, payment * 0.01)) return { months: m - 1, totalInterest: round2(total), firstYearInterest: round2(firstYear) };
    const interest = bal * r;
    if (payment <= interest) {
      // Payment doesn't cover interest: the balance never goes down.
      const yearInterest = m === 1 ? interest * 12 : firstYear;
      return { months: null, totalInterest: null, firstYearInterest: round2(yearInterest) };
    }
    total += interest;
    if (m <= 12) firstYear += interest;
    bal = bal + interest - payment;
  }
  return { months: null, totalInterest: null, firstYearInterest: round2(firstYear) };
}

/** Whole months between two YYYY-MM-DD dates (0 if `to` is earlier). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

/**
 * Balance today, assuming the standard payment was made each month since the
 * balance was last verified (interest applied first).
 */
export function estimatedBalance(debt: DebtInput, today: string): { balance: number; estimated: boolean } {
  const months = monthsBetween(debt.balanceAsOf, today);
  if (months === 0) return { balance: debt.balance, estimated: false };
  const r = monthlyRate(debt.apr ?? 0);
  let bal = debt.balance;
  for (let i = 0; i < months && bal > 0; i++) bal = Math.max(0, bal * (1 + r) - debt.monthlyPayment);
  return { balance: round2(bal), estimated: true };
}

/** Full monthly housing payment: principal & interest + taxes + insurance + PMI. */
export const totalMonthlyPayment = (d: DebtInput) =>
  d.monthlyPayment + (d.escrowTaxes ?? 0) + (d.escrowInsurance ?? 0) + (d.pmi ?? 0);

export function addMonths(date: string, months: number): string {
  const [y, m] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

export interface DebtAnalysis {
  id: string;
  lender: string;
  type: DebtType;
  balance: number;
  balanceEstimated: boolean;
  apr: number | null;
  aprIsEstimate: boolean;
  /** Monthly payment including escrow for mortgages. */
  payment: number;
  monthlyInterest: number | null;
  yearlyInterest: number | null;
  payoffMonths: number | null;
  payoffDate: string | null; // YYYY-MM-01
  remainingInterest: number | null;
  /** Payment doesn't cover the interest, so the balance never shrinks. */
  notPayingDown: boolean;
  utilization: number | null; // credit cards
}

export function analyzeDebt(debt: DebtInput, today: string): DebtAnalysis {
  const { balance, estimated } = estimatedBalance(debt, today);
  const base = {
    id: debt.id,
    lender: debt.lender,
    type: debt.type,
    balance,
    balanceEstimated: estimated,
    apr: debt.apr,
    aprIsEstimate: debt.aprIsEstimate,
    payment: round2(totalMonthlyPayment(debt)),
    utilization: debt.creditLimit ? balance / debt.creditLimit : null,
  };
  if (debt.apr == null) {
    return { ...base, monthlyInterest: null, yearlyInterest: null, payoffMonths: null, payoffDate: null, remainingInterest: null, notPayingDown: false };
  }
  const a = amortize(balance, debt.apr, debt.monthlyPayment);
  return {
    ...base,
    monthlyInterest: round2(monthlyInterest(balance, debt.apr)),
    yearlyInterest: a.firstYearInterest,
    payoffMonths: a.months,
    payoffDate: a.months != null ? addMonths(today, a.months) : null,
    remainingInterest: a.totalInterest,
    notPayingDown: a.months == null && balance > 0,
  };
}

// ─── Ratios ──────────────────────────────────────────────────

export type DtiBand = "excellent" | "good" | "elevated" | "high";

/** DTI bands: under 36% excellent, under 43% approvable, up to 50% elevated, over 50% high risk. */
export function dtiBand(dti: number): DtiBand {
  if (dti < 0.36) return "excellent";
  if (dti < 0.43) return "good";
  if (dti <= 0.5) return "elevated";
  return "high";
}

const LIQUID: AssetType[] = ["CHECKING", "SAVINGS", "INVESTMENT"];
const CASH: AssetType[] = ["CHECKING", "SAVINGS"];

// ─── Summary ─────────────────────────────────────────────────

export interface SummaryInput {
  profileType: ProfileType | null;
  incomes: IncomeInput[];
  bills: BillInput[];
  debts: DebtInput[];
  assets: AssetInput[];
  today: string; // YYYY-MM-DD
  /** Average monthly business net income from the P&L (recurring), when entered. */
  businessNetMonthly?: number | null;
}

export function summarize(input: SummaryInput) {
  const { incomes, bills, debts, assets, today } = input;
  const hasBusiness = input.profileType === "BUSINESS_OWNER" || input.profileType === "BOTH";

  // Income
  const activeIncome = incomes.filter((i) => i.active);
  const grossMonthly = sum(activeIncome.map((i) => monthly(i.amount, i.frequency)));
  const netMonthly = sum(activeIncome.map((i) => monthly(i.netAmount ?? i.amount, i.frequency)));
  const missingTakeHome = activeIncome.some((i) => i.netAmount == null && !BUSINESS_INCOME_TYPES.includes(i.type));
  const businessIncomeMonthly = sum(
    activeIncome.filter((i) => BUSINESS_INCOME_TYPES.includes(i.type)).map((i) => monthly(i.amount, i.frequency))
  );
  // Business owners set aside an estimated share for taxes: based on the P&L's net
  // income when it's been entered, otherwise on owner draws and distributions.
  const taxBase = input.businessNetMonthly != null ? Math.max(0, input.businessNetMonthly) : businessIncomeMonthly;
  const taxReserve = hasBusiness ? taxBase * TAX_RESERVE_RATE : 0;

  // Bills
  const billsMonthly = sum(bills.map((b) => monthly(b.amount, b.frequency)));
  const billsByCategory: Record<string, number> = {};
  for (const b of bills) billsByCategory[b.category] = (billsByCategory[b.category] ?? 0) + monthly(b.amount, b.frequency);

  // Debts
  const activeDebts = debts.filter((d) => !d.paidOffAt);
  const debtAnalyses = activeDebts.map((d) => analyzeDebt(d, today));
  const debtPaymentsMonthly = sum(debtAnalyses.map((d) => d.payment));
  const totalDebt = sum(debtAnalyses.map((d) => d.balance));
  const interestMonthly = sum(debtAnalyses.map((d) => d.monthlyInterest ?? 0));
  const interestYearly = sum(debtAnalyses.map((d) => d.yearlyInterest ?? 0));
  const missingApr = debtAnalyses.filter((d) => d.apr == null).length;
  const neverPaidOff = debtAnalyses.some((d) => d.notPayingDown || (d.apr != null && d.payoffMonths == null && d.balance > 0));
  const debtFreeDate =
    debtAnalyses.length === 0 || neverPaidOff || missingApr > 0
      ? null
      : debtAnalyses.map((d) => d.payoffDate ?? today).sort().at(-1)!;

  const cards = debtAnalyses.filter((d) => d.type === "CREDIT_CARD");
  const cardLimits = sum(activeDebts.filter((d) => d.type === "CREDIT_CARD").map((d) => d.creditLimit ?? 0));
  const utilization = cardLimits > 0 ? sum(cards.map((c) => c.balance)) / cardLimits : null;

  // Assets
  const assetTotal = sum(assets.map((a) => a.value));
  const liquid = sum(assets.filter((a) => LIQUID.includes(a.type)).map((a) => a.value));
  const cash = sum(assets.filter((a) => CASH.includes(a.type)).map((a) => a.value));
  const retirement = sum(assets.filter((a) => a.type === "RETIREMENT").map((a) => a.value));
  const balanceById = new Map(debtAnalyses.map((d) => [d.id, d.balance]));
  const equity = assets
    .filter((a) => a.securesDebtId)
    .map((a) => ({ assetId: a.id, name: a.name, value: a.value, owed: balanceById.get(a.securesDebtId!) ?? 0 }))
    .map((e) => ({ ...e, equity: e.value - e.owed }));

  // Cash flow
  const cashFlow = netMonthly - billsMonthly - debtPaymentsMonthly - taxReserve;
  const savingsRate = netMonthly > 0 ? cashFlow / netMonthly : null;

  // Emergency fund
  const monthlyExpenses = billsMonthly + debtPaymentsMonthly;
  const emergencyTarget = monthlyExpenses * EMERGENCY_FUND_MONTHS;
  const emergencyGap = Math.max(0, emergencyTarget - cash);
  const monthsToEmergencyGoal = emergencyGap === 0 ? 0 : cashFlow > 0 ? Math.ceil(emergencyGap / cashFlow) : null;

  const dti = grossMonthly > 0 ? debtPaymentsMonthly / grossMonthly : null;

  return {
    hasBusiness,
    income: {
      grossMonthly: round2(grossMonthly),
      netMonthly: round2(netMonthly),
      businessMonthly: round2(businessIncomeMonthly),
      missingTakeHome,
    },
    bills: { monthly: round2(billsMonthly), byCategory: Object.fromEntries(Object.entries(billsByCategory).map(([k, v]) => [k, round2(v)])) },
    debt: {
      total: round2(totalDebt),
      paymentsMonthly: round2(debtPaymentsMonthly),
      interestMonthly: round2(interestMonthly),
      interestYearly: round2(interestYearly),
      missingApr,
      debtFreeDate,
      utilization,
      items: debtAnalyses,
    },
    assets: { total: round2(assetTotal), liquid: round2(liquid), cash: round2(cash), retirement: round2(retirement), equity },
    netWorth: round2(assetTotal - totalDebt),
    debtToAsset: assetTotal > 0 ? totalDebt / assetTotal : null,
    cashFlow: {
      taxReserve: round2(taxReserve),
      taxReserveBasis: !hasBusiness ? null : input.businessNetMonthly != null ? ("pnl" as const) : ("draws" as const),
      beforeTaxReserve: round2(cashFlow + taxReserve),
      monthly: round2(cashFlow),
      savingsRate,
    },
    dti: dti != null ? { value: dti, band: dtiBand(dti) } : null,
    emergencyFund: {
      monthlyExpenses: round2(monthlyExpenses),
      target: round2(emergencyTarget),
      saved: round2(cash),
      gap: round2(emergencyGap),
      monthsToGoal: monthsToEmergencyGoal,
    },
  };
}

export type FoundationSummary = ReturnType<typeof summarize>;

// ─── Payoff planning ─────────────────────────────────────────

export type PayoffStrategy = "snowball" | "avalanche" | "custom";

export interface PayoffDebt {
  id: string;
  lender: string;
  balance: number;
  apr: number;
  /** Minimum monthly payment (principal & interest; escrow excluded). */
  payment: number;
}

export interface PayoffResult {
  /** Months until every debt is paid, or null if it never happens. */
  months: number | null;
  debtFreeDate: string | null;
  totalInterest: number | null;
  /** Debts in the order they get paid off. */
  order: { id: string; lender: string; month: number | null; date: string | null; interest: number; freedPayment: number }[];
  /** Total balance at the end of each month (month 0 = today). */
  timeline: number[];
}

/** Snowball: smallest balance first. Avalanche: highest rate first. Custom: the given order. */
export function payoffOrder(debts: PayoffDebt[], strategy: PayoffStrategy, customOrder: string[] = []): PayoffDebt[] {
  const list = [...debts];
  if (strategy === "snowball") return list.sort((a, b) => a.balance - b.balance || b.apr - a.apr);
  if (strategy === "avalanche") return list.sort((a, b) => b.apr - a.apr || a.balance - b.balance);
  const rank = new Map(customOrder.map((id, i) => [id, i]));
  return list.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
}

/**
 * Month-by-month payoff. Every debt gets its minimum; the extra amount plus the
 * minimums of debts already paid off ("rolled over") go to the first unpaid debt
 * in priority order. With rollover off and no extra, this is "keep paying the minimums".
 */
export function simulatePayoff(
  debts: PayoffDebt[],
  opts: { strategy: PayoffStrategy; extra: number; today: string; customOrder?: string[]; rollover?: boolean }
): PayoffResult {
  const ordered = payoffOrder(debts, opts.strategy, opts.customOrder);
  const rollover = opts.rollover ?? true;
  const bal = new Map(ordered.map((d) => [d.id, d.balance]));
  const interestPaid = new Map(ordered.map((d) => [d.id, 0]));
  const paidMonth = new Map<string, number>();
  const budget = sum(ordered.map((d) => d.payment)) + opts.extra;
  const timeline = [round2(sum(ordered.map((d) => d.balance)))];
  let total = 0;

  for (let m = 1; m <= MAX_MONTHS; m++) {
    const active = ordered.filter((d) => (bal.get(d.id) ?? 0) > 0.005);
    if (active.length === 0) break;
    // Interest accrues first.
    for (const d of active) {
      const i = bal.get(d.id)! * monthlyRate(d.apr);
      bal.set(d.id, bal.get(d.id)! + i);
      interestPaid.set(d.id, interestPaid.get(d.id)! + i);
      total += i;
    }
    // Minimums, then whatever's left goes to the priority debt(s).
    let available = rollover ? budget : sum(active.map((d) => d.payment)) + opts.extra;
    for (const d of active) {
      const pay = Math.min(d.payment, bal.get(d.id)!, available);
      bal.set(d.id, bal.get(d.id)! - pay);
      available -= pay;
    }
    // Without rollover, a final payment's unused remainder isn't redirected: only the extra is.
    if (!rollover) available = Math.min(available, opts.extra);
    for (const d of active) {
      if (available <= 0.005) break;
      const pay = Math.min(available, bal.get(d.id)!);
      bal.set(d.id, bal.get(d.id)! - pay);
      available -= pay;
    }
    for (const d of active) {
      if (bal.get(d.id)! <= Math.max(0.005, d.payment * 0.01) && !paidMonth.has(d.id)) {
        bal.set(d.id, 0);
        paidMonth.set(d.id, m);
      }
    }
    timeline.push(round2(sum([...bal.values()])));
  }

  const done = paidMonth.size === ordered.length;
  const months = done ? Math.max(0, ...paidMonth.values()) : null;
  const order = [...ordered]
    .sort((a, b) => (paidMonth.get(a.id) ?? Infinity) - (paidMonth.get(b.id) ?? Infinity))
    .map((d) => {
      const month = paidMonth.get(d.id) ?? null;
      return { id: d.id, lender: d.lender, month, date: month != null ? addMonths(opts.today, month) : null, interest: round2(interestPaid.get(d.id)!), freedPayment: d.payment };
    });
  return {
    months,
    debtFreeDate: months != null ? addMonths(opts.today, months) : null,
    totalInterest: done ? round2(total) : null,
    order,
    timeline,
  };
}

// ─── Consolidation ───────────────────────────────────────────

/** Fixed payment that pays off `principal` over `months` at `aprPct`. */
export function loanPayment(principal: number, aprPct: number, months: number): number {
  const r = monthlyRate(aprPct);
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export interface ConsolidationResult {
  current: { payment: number; months: number | null; totalInterest: number | null };
  loan: { principal: number; payment: number; months: number; totalInterest: number; fee: number };
  /** Total cost difference (current interest − loan interest − fee). Positive = saves money. */
  savings: number | null;
  monthlyPaymentChange: number;
  /** Month when interest saved has covered the fee, or null if it never does. */
  breakEvenMonth: number | null;
}

/**
 * Roll `debts` into one new loan. The fee (e.g. origination) is added to the loan
 * balance, as most consolidation loans do.
 */
export function consolidate(debts: PayoffDebt[], loan: { apr: number; months: number; fee: number }): ConsolidationResult {
  const balance = sum(debts.map((d) => d.balance));
  const principal = balance + loan.fee;
  const payment = loanPayment(principal, loan.apr, loan.months);
  const newInterest = payment * loan.months - principal;

  const current = simulatePayoff(debts, { strategy: "avalanche", extra: 0, today: "2000-01-01", rollover: false });

  // Break-even: compare interest paid month by month under each option.
  let breakEven: number | null = null;
  let curBal = new Map(debts.map((d) => [d.id, d.balance]));
  let curInterest = 0;
  let loanBal = principal;
  let loanInterest = 0;
  for (let m = 1; m <= Math.max(loan.months, 360); m++) {
    const next = new Map(curBal);
    for (const d of debts) {
      const b = curBal.get(d.id)!;
      if (b <= 0) continue;
      const i = b * monthlyRate(d.apr);
      curInterest += i;
      next.set(d.id, Math.max(0, b + i - d.payment));
    }
    curBal = next;
    if (loanBal > 0) {
      const i = loanBal * monthlyRate(loan.apr);
      loanInterest += i;
      loanBal = Math.max(0, loanBal + i - payment);
    }
    if (curInterest - (loanInterest + loan.fee) >= 0) {
      breakEven = m;
      break;
    }
  }

  return {
    current: { payment: round2(sum(debts.map((d) => d.payment))), months: current.months, totalInterest: current.totalInterest },
    loan: { principal: round2(principal), payment: round2(payment), months: loan.months, totalInterest: round2(newInterest), fee: loan.fee },
    savings: current.totalInterest != null ? round2(current.totalInterest - newInterest - loan.fee) : null,
    monthlyPaymentChange: round2(payment - sum(debts.map((d) => d.payment))),
    breakEvenMonth: breakEven,
  };
}

// ─── Business P&L ────────────────────────────────────────────

export interface BusinessMonthInput {
  month: string; // YYYY-MM
  revenue: number;
}

export interface BusinessExpenseInput {
  id: string;
  month: string; // YYYY-MM
  name: string;
  category: string;
  amount: number;
  oneTime: boolean;
}

/** Valuation shortcut for a small business: 2× annual net profit (an estimate, not a formal valuation). */
export const BUSINESS_VALUE_MULTIPLE = 2;

/** The `count` months ending with `endMonth` (YYYY-MM), oldest first. */
export function monthRange(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(endMonth + "-01", i - (count - 1)).slice(0, 7));
}

/**
 * Profit & loss for the given months: revenue minus expenses by category, with
 * one-time items broken out so the recurring picture stays clear.
 */
export function businessPnl(months: string[], revenue: BusinessMonthInput[], expenses: BusinessExpenseInput[]) {
  const rev = new Map(revenue.map((r) => [r.month, r.revenue]));
  const categories = [...new Set(expenses.filter((e) => months.includes(e.month) && !e.oneTime).map((e) => e.category))].sort();

  const columns = months.map((m) => {
    const inMonth = expenses.filter((e) => e.month === m);
    const byCategory = Object.fromEntries(
      categories.map((c) => [c, round2(sum(inMonth.filter((e) => !e.oneTime && e.category === c).map((e) => e.amount)))])
    );
    const recurring = sum(inMonth.filter((e) => !e.oneTime).map((e) => e.amount));
    const oneTime = sum(inMonth.filter((e) => e.oneTime).map((e) => e.amount));
    const revenueM = rev.get(m) ?? null;
    return {
      month: m,
      revenue: revenueM,
      byCategory,
      recurringExpenses: round2(recurring),
      oneTimeExpenses: round2(oneTime),
      netOperatingIncome: revenueM != null ? round2(revenueM - recurring - oneTime) : null,
      /** Net excluding one-time items: the run-rate. */
      recurringNet: revenueM != null ? round2(revenueM - recurring) : null,
    };
  });

  const withData = columns.filter((c) => c.revenue != null);
  const avg = (f: (c: (typeof columns)[number]) => number | null) =>
    withData.length ? round2(sum(withData.map((c) => f(c) ?? 0)) / withData.length) : null;
  const average = {
    revenue: avg((c) => c.revenue),
    byCategory: Object.fromEntries(categories.map((c) => [c, avg((col) => col.byCategory[c])])),
    recurringExpenses: avg((c) => c.recurringExpenses),
    oneTimeExpenses: avg((c) => c.oneTimeExpenses),
    netOperatingIncome: avg((c) => c.netOperatingIncome),
    recurringNet: avg((c) => c.recurringNet),
  };
  const annualNet = average.recurringNet != null ? average.recurringNet * 12 : null;

  return {
    categories,
    columns,
    average,
    monthsWithData: withData.length,
    oneTimeItems: expenses.filter((e) => months.includes(e.month) && e.oneTime),
    /** Suggested value for the business as an asset (estimate). */
    suggestedValue: annualNet != null && annualNet > 0 ? round2(annualNet * BUSINESS_VALUE_MULTIPLE) : null,
  };
}

export type BusinessPnl = ReturnType<typeof businessPnl>;

// ─── Home purchase scenarios ─────────────────────────────────

export interface MortgageScenarioInput {
  price: number;
  downPayment: number;
  apr: number;
  termYears: number;
  /** Annual property tax as % of price. */
  propertyTaxPct: number;
  insuranceAnnual: number;
  /** Annual PMI as % of the loan, charged while down payment is under 20%. */
  pmiPct: number;
}

/** Full PITI for a home purchase. */
export function mortgagePiti(i: MortgageScenarioInput) {
  const loan = Math.max(0, i.price - i.downPayment);
  const pi = loan > 0 ? loanPayment(loan, i.apr, i.termYears * 12) : 0;
  const taxes = (i.price * i.propertyTaxPct) / 100 / 12;
  const insurance = i.insuranceAnnual / 12;
  const pmi = i.downPayment / i.price < 0.2 ? (loan * i.pmiPct) / 100 / 12 : 0;
  return {
    loan: round2(loan),
    principalInterest: round2(pi),
    taxes: round2(taxes),
    insurance: round2(insurance),
    pmi: round2(pmi),
    piti: round2(pi + taxes + insurance + pmi),
  };
}

/**
 * What buying at each price would do to DTI and monthly cash flow. When the home
 * replaces current housing, today's mortgage payments and housing bills drop out.
 */
export function mortgageScenarios(
  summary: FoundationSummary,
  prices: number[],
  base: Omit<MortgageScenarioInput, "price" | "downPayment"> & { downPayment?: number; downPaymentPct?: number },
  opts: { replacesCurrentHousing: boolean; currentHousingDebtPayments: number; currentHousingBills: number }
) {
  return prices.map((price) => {
    const downPayment = base.downPayment ?? (price * (base.downPaymentPct ?? 20)) / 100;
    const p = mortgagePiti({ ...base, price, downPayment });
    const removedDebt = opts.replacesCurrentHousing ? opts.currentHousingDebtPayments : 0;
    const removedBills = opts.replacesCurrentHousing ? opts.currentHousingBills : 0;
    const newDebtPayments = summary.debt.paymentsMonthly - removedDebt + p.piti;
    const dti = summary.income.grossMonthly > 0 ? newDebtPayments / summary.income.grossMonthly : null;
    const netChange = -(p.piti - removedDebt - removedBills);
    return {
      price,
      downPayment: round2(downPayment),
      ...p,
      dti,
      dtiBand: dti != null ? dtiBand(dti) : null,
      monthlyChange: round2(netChange),
      cashFlowAfter: round2(summary.cashFlow.monthly + netChange),
    };
  });
}
