"use client";

import { useCallback, useEffect, useState } from "react";
import type { BusinessPnl, FoundationSummary } from "@/lib/foundation/calc";

export interface FoundationData {
  profile: { type: "EMPLOYEE" | "BUSINESS_OWNER" | "BOTH" | null; includeTradingInNetWorth: boolean };
  today: string;
  incomes: Income[];
  bills: Bill[];
  debts: Debt[];
  assets: Asset[];
  tradingAssets: { id: string; name: string; value: number }[];
  business: {
    months: string[];
    revenue: { month: string; revenue: number }[];
    expenses: BusinessExpense[];
    pnl: BusinessPnl;
  } | null;
  summary: FoundationSummary;
  history: { month: string; assets: number; liabilities: number; netWorth: number }[];
}

export interface Income {
  id: string;
  name: string;
  type: string;
  amount: number;
  netAmount: number | null;
  frequency: string;
  consistency: string;
  active: boolean;
}
export interface Bill {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  dueDay: number | null;
  autopay: boolean;
}
export interface Debt {
  id: string;
  lender: string;
  type: string;
  balance: number;
  balanceAsOf: string;
  monthlyPayment: number;
  apr: number | null;
  aprIsEstimate: boolean;
  creditLimit: number | null;
  escrowTaxes: number | null;
  escrowInsurance: number | null;
  pmi: number | null;
  paidOffAt: string | null;
}
export interface BusinessExpense {
  id: string;
  month: string;
  name: string;
  category: string;
  amount: number;
  oneTime: boolean;
}
export interface Asset {
  id: string;
  name: string;
  type: string;
  value: number;
  valueIsEstimate: boolean;
  asOf: string;
  securesDebtId: string | null;
}

export type Resource = "income" | "bills" | "debts" | "assets" | "business-expenses";

/** Fired when the profile changes, so the sidebar can show or hide business tools. */
export const PROFILE_EVENT = "wealthos:profile-changed";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

/** Loads the full Foundation picture and offers create/update/remove that refresh it. */
export function useFoundation() {
  const [data, setData] = useState<FoundationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Last month of the 3-month business P&L window (YYYY-MM); null = current month.
  const [businessEnd, setBusinessEnd] = useState<string | null>(null);
  const url = `/api/foundation/summary${businessEnd ? `?businessEnd=${businessEnd}` : ""}`;

  const reload = useCallback(async () => {
    try {
      setData(await send(url, "GET"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your numbers.");
    }
  }, [url]);

  useEffect(() => {
    send(url, "GET")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your numbers."));
  }, [url]);

  const create = useCallback(
    async (resource: Resource, body: object) => {
      await send(`/api/foundation/${resource}`, "POST", body);
      await reload();
    },
    [reload]
  );
  const update = useCallback(
    async (resource: Resource, id: string, body: object) => {
      await send(`/api/foundation/${resource}/${id}`, "PATCH", body);
      await reload();
    },
    [reload]
  );
  const remove = useCallback(
    async (resource: Resource, id: string) => {
      await send(`/api/foundation/${resource}/${id}`, "DELETE");
      await reload();
    },
    [reload]
  );
  const setPreferences = useCallback(
    async (body: { profileType?: string; includeTradingInNetWorth?: boolean }) => {
      await send("/api/user/preferences", "PATCH", body);
      window.dispatchEvent(new Event(PROFILE_EVENT));
      await reload();
    },
    [reload]
  );
  const setRevenue = useCallback(
    async (month: string, revenue: number | null) => {
      await send("/api/foundation/business-revenue", "PUT", { month, revenue });
      await reload();
    },
    [reload]
  );

  return { data, error, reload, create, update, remove, setPreferences, setRevenue, businessEnd, setBusinessEnd };
}
