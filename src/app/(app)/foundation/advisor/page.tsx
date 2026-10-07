"use client";

import { useEffect, useState } from "react";
import { AdvisorChat } from "@/components/foundation/AdvisorChat";
import { FoundationPage, Tile } from "@/components/foundation/FoundationPage";
import { fmtMoney, fmtPct } from "@/lib/foundation/labels";

interface Spend {
  admin: boolean;
  month?: string;
  replies?: number;
  people?: number;
  totalUsd?: number;
  perPersonUsd?: number;
  perReplyUsd?: number;
}

export default function AdvisorPage() {
  const [spend, setSpend] = useState<Spend | null>(null);
  useEffect(() => {
    fetch("/api/foundation/advisor/spend")
      .then((r) => r.json())
      .then(setSpend)
      .catch(() => {});
  }, []);

  return (
    <FoundationPage
      title="Advisor"
      subtitle="Talk through your money with an AI advisor. It works from the numbers you've entered and suggests updates you confirm."
    >
      {(data, api) => {
        const s = data.summary;
        return (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
            <AdvisorChat hasBusiness={s.hasBusiness} onRecordsChanged={api.reload} />
            <aside className="space-y-3">
              <Tile label="Net worth" value={fmtMoney(s.netWorth)} />
              <Tile
                label="Left over each month"
                value={fmtMoney(s.cashFlow.monthly)}
                tone={s.cashFlow.monthly >= 0 ? "text-success" : "text-danger"}
              />
              <Tile label="Interest to lenders" value={`${fmtMoney(s.debt.interestMonthly)}/mo`} tone={s.debt.interestMonthly > 0 ? "text-danger" : ""} />
              <Tile label="Debt-to-income" value={s.dti ? fmtPct(s.dti.value) : "—"} />
              <p className="text-[11px] text-muted px-1">
                General education, not tax or legal advice. Confirm tax decisions with your accountant.
              </p>
              {spend?.admin && (
                <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-3 text-xs space-y-1">
                  <p className="font-semibold text-sm">Advisor spend · {spend.month}</p>
                  <p>
                    <span className="num font-semibold">${spend.totalUsd?.toFixed(2)}</span> on your key
                  </p>
                  <p className="text-muted">
                    {spend.replies} replies · {spend.people} people · ${spend.perPersonUsd?.toFixed(2)}/person · $
                    {spend.perReplyUsd?.toFixed(3)}/reply
                  </p>
                  <p className="text-muted">Visible to ADMIN_EMAILS only.</p>
                </div>
              )}
            </aside>
          </div>
        );
      }}
    </FoundationPage>
  );
}
