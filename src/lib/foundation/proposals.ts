/** Record changes the advisor can propose (client-safe: shared by the agent and the confirm cards). */

export const PROPOSAL_ACTIONS = [
  "add_income",
  "update_income",
  "add_bill",
  "update_bill",
  "add_debt",
  "update_debt",
  "mark_debt_paid_off",
  "add_asset",
  "update_asset",
] as const;

export type ProposalAction = (typeof PROPOSAL_ACTIONS)[number];

export interface Proposal {
  action: ProposalAction;
  id?: string;
  fields: Record<string, string | number | boolean | null>;
  label: string;
  reason: string;
}

/** Which record each action touches, and whether it creates one. */
export const ACTION_TARGET: Record<ProposalAction, { resource: "income" | "bills" | "debts" | "assets"; create: boolean }> = {
  add_income: { resource: "income", create: true },
  update_income: { resource: "income", create: false },
  add_bill: { resource: "bills", create: true },
  update_bill: { resource: "bills", create: false },
  add_debt: { resource: "debts", create: true },
  update_debt: { resource: "debts", create: false },
  mark_debt_paid_off: { resource: "debts", create: false },
  add_asset: { resource: "assets", create: true },
  update_asset: { resource: "assets", create: false },
};
