"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionHeader, SnapshotStat, ToolGrid } from "@/components/sections/SectionHub";
import { FOUNDATION } from "@/lib/sections";

export default function FoundationHubPage() {
  // Snapshot values fill in once Build Your Budget and Debt Consolidation store data.
  return (
    <div className="space-y-8">
      <SectionHeader section={FOUNDATION} />

      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em]">This month</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SnapshotStat label="Income" value={null} hint="From your budget" />
          <SnapshotStat label="Spending" value={null} hint="Against plan" />
          <SnapshotStat label="Savings rate" value={null} hint="Of take-home pay" />
          <SnapshotStat label="Total debt" value={null} hint="Across all balances" />
        </div>
      </section>

      <div className="rise-in rounded-2xl border border-dashed border-border bg-card/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Start with your budget</p>
          <p className="text-sm text-muted mt-1">
            Your Foundation snapshot builds from your income, spending, and debts.
          </p>
        </div>
        <Link href="/foundation/budget">
          <Button>
            Build your budget
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      <ToolGrid section={FOUNDATION} />
    </div>
  );
}
