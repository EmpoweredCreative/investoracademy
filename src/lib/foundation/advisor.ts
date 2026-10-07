import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { APP_NAME } from "@/lib/brand";
import {
  consolidate,
  monthly,
  mortgageScenarios,
  simulatePayoff,
  type Frequency,
  type PayoffDebt,
} from "./calc";
import { assetSchema, billSchema, debtSchema, incomeSchema, loadFoundation } from "./store";
import type { Usage } from "./advisorLimits";
import { ACTION_TARGET, PROPOSAL_ACTIONS, type Proposal } from "./proposals";

export type { Proposal };

export const ADVISOR_MODEL = "claude-sonnet-5-5";

/** Events streamed to the browser as newline-delimited JSON. */
export type AdvisorEvent =
  | { t: "text"; d: string }
  | { t: "tool_start"; id: string; name: string; label: string }
  | { t: "tool_end"; id: string; name: string; summary: string; ok: boolean }
  | { t: "proposal"; proposal: Proposal }
  | { t: "allowance"; remaining: number | null; limit: number | null }
  | { t: "error"; message: string }
  | { t: "done" };


export interface ToolEventRecord {
  name: string;
  label: string;
  summary: string;
  ok: boolean;
}

/** Stable instructions, cached across turns. Adapted from the financial-planning prompt. */
export const ADVISOR_SYSTEM_PROMPT = `You are the AI financial planning advisor inside ${APP_NAME}'s Foundation section. Don't bring up which AI company or model powers you; if someone asks directly, answer honestly. You help one person build a complete, accurate picture of their financial life and use it to make smart decisions. You work conversationally: ask for information, run the numbers with your tools, flag issues, and suggest updates to their records.

## Their financial picture
The app already holds their records: income sources, monthly bills, debts (balance, payment, interest rate), assets, and for business owners a business P&L. The app shows these as Monthly Budget, Debt, Net Worth, Statements and Business P&L pages.
- Call get_financial_picture at the start of a conversation and whenever you need current numbers. Never invent or recall figures; if something isn't recorded, ask for it.
- Their profile is EMPLOYEE (W-2 paycheck), BUSINESS_OWNER, or BOTH. Income type matters for lending: lenders usually average 1099 and owner-draw income over two years of tax returns, while W-2 income counts right away. Business owners get an estimated tax reserve (about 25% of business net income); always call it an estimate to confirm with their accountant.
- Mortgage and loan payments live in debts, never in bills.

## Keeping records current
When they report a change (a payment made, a new balance, a new account, a debt paid off), use propose_update so the app can save it after they confirm. Rules:
- If they don't report a payment, the app already assumes the standard monthly payment was made since the balance was last verified, and labels that balance "estimated". Ask for a current balance when it matters.
- Prefer verified numbers (statements, account screens) over estimates. When sources differ, use the most recent direct account data. They can upload a statement screenshot in the app for you to read.
- Credit bureau reports lag 30–45 days behind actual balances, and interest rates on credit reports are often estimates. Ask them to confirm actual rates from statements.
- Every debt needs its interest rate so they can see what they pay lenders. If a rate is marked estimated, ask for the real one.
- When a debt is paid off, celebrate it, propose marking it paid off, and mention how much monthly cash it frees up.

## Scenarios
Model decisions fully with your tools, and show the numbers:
- Debt payoff: snowball (smallest balance first) vs avalanche (highest rate first), with payoff order, timeline, interest saved, and payment freed as each debt clears (simulate_debt_payoff).
- Consolidation: payment, total interest, fee, break-even month, and whether it actually saves money (consolidation_scenario).
- Buying or refinancing a home: full PITI at several price points side by side, DTI at each, monthly cash flow change, and approval risks with what would fix them (mortgage_scenario).
- Raises and business income: gross needed to reach a target take-home, and what the business P&L can support (salary_scenario, get_financial_picture).
- Emergency fund: 3 months of total expenses as the target, the gap, and how fast they can close it (emergency_fund_plan).
- Credit score: explain what's likely hurting it (utilization over 30%, late payments, account age) and what specific actions would help, with realistic timelines. You can't see their score or report, so ask, and be clear these are general patterns, not predictions.
- Relocation or investing vs paying off debt: compare honestly. Paying off a debt is a guaranteed return equal to its interest rate; investing is not guaranteed. Factor in risk, liquidity, and their current cash position, then give a clear recommendation with reasoning.

## Key measures
- DTI = total monthly debt payments (with full PITI for housing) ÷ gross monthly income. Under 36% excellent, under 43% approvable for most loans, over 50% high risk.
- Net worth = assets − liabilities. Liquid assets = checking, savings and investment accounts; retirement is semi-liquid (penalties); home, vehicles and business are illiquid.
- Business valuations at 2× annual net profit are placeholders until a formal valuation.
- Break-even: when one option overtakes another (e.g. months until a refinance's closing costs are covered).

## How you talk
- Be direct and concrete: give numbers, not vague guidance. Lead with the answer, then the supporting numbers in a short list or small table (Markdown).
- Flag risks honestly but constructively, to inform, not to scare.
- Say clearly when something is an estimate and what would make it more accurate.
- When they make a good financial move, acknowledge it. These wins matter.
- Ask clarifying questions one at a time, not in long lists.
- Never give specific tax or legal advice; recommend confirming tax-related decisions with their accountant or attorney.
- If you don't have enough information to answer accurately, ask rather than guess.

## Privacy
Never ask for, repeat, or store account numbers, Social Security numbers, or other identifying financial details. Lender names and balances are fine.`;

interface Ctx {
  userId: string;
  emit: (e: AdvisorEvent) => void;
  toolLog: ToolEventRecord[];
}

function tracked<T>(ctx: Ctx, name: string, label: (input: T) => string, run: (input: T) => Promise<{ result: unknown; summary: string }>) {
  return async (input: T) => {
    const id = `${name}-${Math.random().toString(36).slice(2, 8)}`;
    let l = name;
    try {
      l = label(input);
    } catch {
      // Label failures surface as the tool's error below.
    }
    ctx.emit({ t: "tool_start", id, name, label: l });
    try {
      const { result, summary } = await run(input);
      ctx.emit({ t: "tool_end", id, name, summary, ok: true });
      ctx.toolLog.push({ name, label: l, summary, ok: true });
      return JSON.stringify(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.emit({ t: "tool_end", id, name, summary: message, ok: false });
      ctx.toolLog.push({ name, label: l, summary: message, ok: false });
      return JSON.stringify({ error: message });
    }
  };
}

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Compact view of everything recorded, for the model. */
async function financialPicture(userId: string) {
  const d = await loadFoundation(userId);
  const s = d.summary;
  return {
    today: d.today,
    profileType: d.profile.type,
    income: d.incomes.map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type,
      grossMonthly: Math.round(monthly(i.amount, i.frequency as Frequency)),
      takeHomeMonthly: i.netAmount != null ? Math.round(monthly(i.netAmount, i.frequency as Frequency)) : null,
      frequency: i.frequency,
      active: i.active,
    })),
    bills: d.bills.map((b) => ({ id: b.id, name: b.name, category: b.category, amount: b.amount, frequency: b.frequency })),
    debts: s.debt.items.map((a) => ({
      id: a.id,
      lender: a.lender,
      type: a.type,
      balance: a.balance,
      balanceIsEstimated: a.balanceEstimated,
      balanceVerifiedOn: d.debts.find((x) => x.id === a.id)?.balanceAsOf,
      aprPct: a.apr,
      aprIsEstimate: a.aprIsEstimate,
      monthlyPayment: a.payment,
      interestThisMonth: a.monthlyInterest,
      payoffDateAtCurrentPayment: a.payoffDate,
      paymentDoesNotCoverInterest: a.notPayingDown,
      creditUtilization: a.utilization,
    })),
    paidOffDebts: d.debts.filter((x) => x.paidOffAt).map((x) => ({ lender: x.lender, paidOffAt: x.paidOffAt })),
    assets: [
      ...d.assets.map((a) => ({ id: a.id, name: a.name, type: a.type, value: a.value, isEstimate: a.valueIsEstimate, securesDebtId: a.securesDebtId })),
      ...d.tradingAssets.map((t) => ({ id: t.id, name: t.name, type: "INVESTMENT", value: t.value, fromTradersCorner: true })),
    ],
    business: d.business
      ? {
          months: d.business.months,
          averageMonthlyRevenue: d.business.pnl.average.revenue,
          averageMonthlyRecurringExpenses: d.business.pnl.average.recurringExpenses,
          averageMonthlyNetExcludingOneTime: d.business.pnl.average.recurringNet,
          oneTimeItems: d.business.pnl.oneTimeItems.map((e) => ({ name: e.name, amount: e.amount, month: e.month })),
          estimatedBusinessValue: d.business.pnl.suggestedValue,
        }
      : null,
    totals: {
      grossIncomeMonthly: s.income.grossMonthly,
      takeHomeMonthly: s.income.netMonthly,
      someIncomeMissingTakeHome: s.income.missingTakeHome,
      billsMonthly: s.bills.monthly,
      debtPaymentsMonthly: s.debt.paymentsMonthly,
      taxReserveMonthly: s.cashFlow.taxReserve,
      leftOverMonthly: s.cashFlow.monthly,
      savingsRate: s.cashFlow.savingsRate,
      totalDebt: s.debt.total,
      interestToLendersMonthly: s.debt.interestMonthly,
      interestToLendersYearly: s.debt.interestYearly,
      debtFreeDateAtCurrentPayments: s.debt.debtFreeDate,
      creditCardUtilization: s.debt.utilization,
      dti: s.dti,
      assets: s.assets.total,
      liquidAssets: s.assets.liquid,
      netWorth: s.netWorth,
      debtToAsset: s.debtToAsset,
      emergencyFund: s.emergencyFund,
      equity: s.assets.equity,
    },
    netWorthHistory: (
      await prisma.netWorthSnapshot.findMany({ where: { userId }, orderBy: { month: "asc" }, take: 24 })
    ).map((r) => ({ month: r.month.toISOString().slice(0, 7), netWorth: r.assets.toNumber() - r.liabilities.toNumber() })),
  };
}

/** Debts eligible for payoff modelling (principal & interest only; escrow excluded). */
async function payoffDebts(userId: string, includeMortgage: boolean, ids?: string[]) {
  const d = await loadFoundation(userId);
  const byId = new Map(d.debts.map((x) => [x.id, x]));
  const items = d.summary.debt.items.filter(
    (a) => a.apr != null && a.balance > 0 && (ids ? ids.includes(a.id) : includeMortgage || a.type !== "MORTGAGE")
  );
  const missingRate = d.summary.debt.items.filter((a) => a.apr == null).map((a) => a.lender);
  return {
    data: d,
    missingRate,
    debts: items.map<PayoffDebt>((a) => ({ id: a.id, lender: a.lender, balance: a.balance, apr: a.apr!, payment: byId.get(a.id)?.monthlyPayment ?? a.payment })),
  };
}

const SCHEMAS = { income: incomeSchema, bills: billSchema, debts: debtSchema, assets: assetSchema };

function buildTools(ctx: Ctx) {
  return [
    betaZodTool({
      name: "get_financial_picture",
      description:
        "Everything the person has recorded: profile, income, bills, debts (with interest cost), assets, business P&L summary, and computed totals (cash flow, DTI, net worth, emergency fund, interest paid to lenders). Call this before answering questions about their numbers.",
      inputSchema: z.object({}),
      run: tracked(ctx, "get_financial_picture", () => "Reading your financial picture", async () => {
        const result = await financialPicture(ctx.userId);
        return {
          result,
          summary: `${result.income.length} income, ${result.bills.length} bills, ${result.debts.length} debts, ${result.assets.length} assets`,
        };
      }),
    }),
    betaZodTool({
      name: "simulate_debt_payoff",
      description:
        "Month-by-month debt payoff. Compares paying only minimums vs a strategy (snowball = smallest balance first, avalanche = highest rate first) where an extra monthly amount and each paid-off debt's payment roll onto the next debt. Debts without an interest rate are excluded and listed.",
      inputSchema: z.object({
        strategy: z.enum(["snowball", "avalanche"]),
        extra_monthly: z.number().min(0).describe("Extra dollars per month on top of minimums"),
        include_mortgage: z.boolean().optional().describe("Mortgages are excluded unless true"),
      }),
      run: tracked(ctx, "simulate_debt_payoff", (i) => `Modeling ${i.strategy} with ${money(i.extra_monthly)}/mo extra`, async (i) => {
        const { debts, missingRate, data } = await payoffDebts(ctx.userId, i.include_mortgage ?? false);
        if (!debts.length) throw new Error("No debts with interest rates to model.");
        const opts = { today: data.today };
        const min = simulatePayoff(debts, { ...opts, strategy: "avalanche", extra: 0, rollover: false });
        const plan = simulatePayoff(debts, { ...opts, strategy: i.strategy, extra: i.extra_monthly });
        const other = simulatePayoff(debts, { ...opts, strategy: i.strategy === "snowball" ? "avalanche" : "snowball", extra: i.extra_monthly });
        const strip = (r: typeof plan) => ({ months: r.months, debtFreeDate: r.debtFreeDate, totalInterest: r.totalInterest, order: r.order });
        return {
          result: { minimumsOnly: strip(min), plan: strip(plan), otherStrategy: strip(other), excludedForMissingRate: missingRate },
          summary: plan.debtFreeDate ? `Debt-free ${plan.debtFreeDate.slice(0, 7)}` : "Never paid off at these payments",
        };
      }),
    }),
    betaZodTool({
      name: "consolidation_scenario",
      description:
        "Roll selected debts into one new loan (fee added to the loan). Returns current vs loan payment, payoff months, total interest, savings (negative = costs more) and the break-even month.",
      inputSchema: z.object({
        debt_ids: z.array(z.string()).min(1).describe("Debt ids from get_financial_picture"),
        apr: z.number().min(0).max(60),
        term_months: z.number().int().min(6).max(360),
        fee_pct: z.number().min(0).max(20).optional(),
      }),
      run: tracked(ctx, "consolidation_scenario", (i) => `Testing a ${i.apr}% consolidation loan`, async (i) => {
        const { debts } = await payoffDebts(ctx.userId, true, i.debt_ids);
        if (!debts.length) throw new Error("None of those debts have an interest rate on record.");
        const balance = debts.reduce((s, d) => s + d.balance, 0);
        const r = consolidate(debts, { apr: i.apr, months: i.term_months, fee: Math.round((balance * (i.fee_pct ?? 0)) / 100) });
        return { result: r, summary: r.savings == null ? "Current debts never pay off" : r.savings >= 0 ? `Saves ${money(r.savings)}` : `Costs ${money(-r.savings)} more` };
      }),
    }),
    betaZodTool({
      name: "mortgage_scenario",
      description:
        "Home purchase at several prices: full PITI (principal, interest, property tax, insurance, PMI under 20% down), DTI at each price, and the monthly cash flow change. Set replaces_current_housing when the new home replaces their current mortgage or rent.",
      inputSchema: z.object({
        prices: z.array(z.number().positive()).min(1).max(6),
        down_payment: z.number().min(0).optional().describe("Dollar down payment (same for every price)"),
        down_payment_pct: z.number().min(0).max(100).optional().describe("Down payment as % of price, if no dollar amount"),
        apr: z.number().min(0).max(20),
        term_years: z.number().int().min(5).max(40).optional(),
        property_tax_pct: z.number().min(0).max(5).optional().describe("Annual property tax as % of price; ask or use ~1.1 as an estimate"),
        insurance_annual: z.number().min(0).optional(),
        pmi_pct: z.number().min(0).max(3).optional(),
        replaces_current_housing: z.boolean(),
      }),
      run: tracked(ctx, "mortgage_scenario", (i) => `Pricing homes at ${i.prices.map((p) => money(p)).join(", ")}`, async (i) => {
        const d = await loadFoundation(ctx.userId);
        const housingDebt = d.summary.debt.items.filter((a) => a.type === "MORTGAGE").reduce((s, a) => s + a.payment, 0);
        const rows = mortgageScenarios(
          d.summary,
          i.prices,
          {
            apr: i.apr,
            termYears: i.term_years ?? 30,
            propertyTaxPct: i.property_tax_pct ?? 1.1,
            insuranceAnnual: i.insurance_annual ?? 1800,
            pmiPct: i.pmi_pct ?? 0.5,
            downPayment: i.down_payment,
            downPaymentPct: i.down_payment_pct,
          },
          { replacesCurrentHousing: i.replaces_current_housing, currentHousingDebtPayments: housingDebt, currentHousingBills: d.summary.bills.byCategory.HOUSING ?? 0 }
        );
        return {
          result: { scenarios: rows, assumptions: { propertyTaxPctIsEstimate: i.property_tax_pct == null, insuranceIsEstimate: i.insurance_annual == null } },
          summary: rows.map((r) => `${money(r.price)} → ${money(r.piti)}/mo`).join(", "),
        };
      }),
    }),
    betaZodTool({
      name: "salary_scenario",
      description:
        "Gross income needed to reach a target monthly take-home, using an estimated effective tax rate (federal + state + FICA), and what it would do to monthly cash flow. Always present the result as an estimate to confirm with a tax professional.",
      inputSchema: z.object({
        target_take_home_monthly: z.number().positive(),
        effective_tax_rate_pct: z.number().min(0).max(60).describe("Estimated combined effective rate; ask if unsure, ~25 is a rough default"),
      }),
      run: tracked(ctx, "salary_scenario", (i) => `Working back from ${money(i.target_take_home_monthly)}/mo take-home`, async (i) => {
        const d = await loadFoundation(ctx.userId);
        const grossMonthly = i.target_take_home_monthly / (1 - i.effective_tax_rate_pct / 100);
        const change = i.target_take_home_monthly - d.summary.income.netMonthly;
        return {
          result: {
            grossMonthlyNeeded: Math.round(grossMonthly),
            grossAnnualNeeded: Math.round(grossMonthly * 12),
            currentTakeHomeMonthly: d.summary.income.netMonthly,
            changeInTakeHome: Math.round(change),
            leftOverMonthlyAfter: Math.round(d.summary.cashFlow.monthly + change),
            isEstimate: true,
          },
          summary: `${money(grossMonthly * 12)}/yr gross needed`,
        };
      }),
    }),
    betaZodTool({
      name: "emergency_fund_plan",
      description: "Emergency fund status (target = 3 months of bills and debt payments) and how long to close the gap at a given monthly contribution.",
      inputSchema: z.object({ monthly_contribution: z.number().min(0).optional().describe("Defaults to their full monthly surplus") }),
      run: tracked(ctx, "emergency_fund_plan", () => "Checking your emergency fund", async (i) => {
        const d = await loadFoundation(ctx.userId);
        const ef = d.summary.emergencyFund;
        const per = i.monthly_contribution ?? Math.max(0, d.summary.cashFlow.monthly);
        const months = ef.gap === 0 ? 0 : per > 0 ? Math.ceil(ef.gap / per) : null;
        return { result: { ...ef, monthlyContribution: per, monthsToGoal: months }, summary: ef.gap === 0 ? "Fully funded" : `${money(ef.gap)} short` };
      }),
    }),
    betaZodTool({
      name: "propose_update",
      description:
        "Suggest a change to their records (new balance, payment made, new debt/bill/asset/income, debt paid off). The app shows it as a card they confirm before anything is saved. Field names match the records: income {name,type,amount,netAmount,frequency}; bill {name,category,amount,frequency,dueDay,autopay}; debt {lender,type,balance,balanceAsOf (YYYY-MM-DD),monthlyPayment,apr,aprIsEstimate,creditLimit,escrowTaxes,escrowInsurance,pmi}; asset {name,type,value,valueIsEstimate,asOf}. For updates pass only the fields that change, plus id. For a new balance include balanceAsOf (or asOf for assets). Never include account numbers.",
      inputSchema: z.object({
        action: z.enum(PROPOSAL_ACTIONS),
        id: z.string().optional().describe("Record id for update_* and mark_debt_paid_off"),
        fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
        label: z.string().max(120).describe("Short description shown on the card, e.g. 'Update Chase Freedom balance to $5,800'"),
        reason: z.string().max(400),
      }),
      run: tracked(ctx, "propose_update", (i) => i.label, async (i) => {
        const target = ACTION_TARGET[i.action];
        let fields = i.fields ?? {};
        if (i.action === "mark_debt_paid_off") fields = { paidOffAt: new Date().toISOString(), balance: 0 };
        // Validate now so the card always saves cleanly.
        const schema = SCHEMAS[target.resource];
        (target.create ? schema : schema.partial()).parse(fields);
        if (!target.create) {
          if (!i.id) throw new Error("id is required for updates");
          const model = { income: prisma.incomeSource, bills: prisma.bill, debts: prisma.debt, assets: prisma.asset }[target.resource] as unknown as {
            findFirst(a: object): Promise<unknown>;
          };
          if (!(await model.findFirst({ where: { id: i.id, userId: ctx.userId } }))) throw new Error("No record with that id");
        }
        ctx.emit({ t: "proposal", proposal: { action: i.action, id: i.id, fields, label: i.label, reason: i.reason } });
        return { result: { shownToUser: true, note: "The person confirms or dismisses this card in the app." }, summary: "Waiting for your confirmation" };
      }),
    }),
  ];
}

/**
 * Run one advisor turn with tools, streaming events. Uses the person's own key
 * when they've added one, otherwise the app's key.
 */
export async function runAdvisorTurn(opts: {
  userId: string;
  apiKey: string | null;
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
  emit: (e: AdvisorEvent) => void;
}): Promise<{ text: string; toolLog: ToolEventRecord[]; usage: Usage }> {
  const toolLog: ToolEventRecord[] = [];
  const ctx: Ctx = { userId: opts.userId, emit: opts.emit, toolLog };
  const client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : new Anthropic();
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let text = "";

  const runner = client.beta.messages.toolRunner({
    model: ADVISOR_MODEL,
    max_tokens: 16000,
    max_iterations: 8,
    stream: true,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: ADVISOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Today is ${new Date().toISOString().slice(0, 10)}.` },
    ],
    tools: buildTools(ctx),
    messages: [...opts.history, { role: "user", content: opts.message }],
  });

  for await (const stream of runner) {
    stream.on("text", (delta) => {
      text += delta;
      opts.emit({ t: "text", d: delta });
    });
    const message = await stream.finalMessage();
    usage.inputTokens += message.usage.input_tokens;
    usage.outputTokens += message.usage.output_tokens;
    usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;
    if (message.stop_reason === "refusal") {
      opts.emit({ t: "error", message: "The advisor can't help with that one. Try rephrasing the question." });
      break;
    }
    if (message.stop_reason === "tool_use" && text && !text.endsWith("\n")) {
      text += "\n\n";
      opts.emit({ t: "text", d: "\n\n" });
    }
  }

  return { text: text.trim(), toolLog, usage };
}
