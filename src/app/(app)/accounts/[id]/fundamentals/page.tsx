"use client";

import { Suspense, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Filter, List } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WatchlistPanel } from "@/components/research/WatchlistPanel";
import { ScreenerPanel } from "@/components/research/ScreenerPanel";
import { AnalystDrawer } from "@/components/research/AnalystDrawer";

// The Screener is where research starts; the Analyst is a drawer available everywhere.
const TABS = [
  { key: "screener", label: "Screener", icon: Filter },
  { key: "watchlist", label: "Watchlist", icon: List },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function ResearchHub() {
  const params = useParams();
  const accountId = params.id as string;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "screener";
  // Bumped after each Analyst turn so the watchlist picks up tickers it added.
  const [watchlistVersion, setWatchlistVersion] = useState(0);

  const setTab = (key: TabKey) => router.replace(key === "screener" ? pathname : `${pathname}?tab=${key}`, { scroll: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/accounts/${accountId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">Research</h1>
          <p className="text-muted text-sm">Screen for candidates, then dig in with filings, financials and investor-lens reports.</p>
        </div>
        <nav className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-card" aria-label="Research sections">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </nav>
        <AnalystDrawer
          accountId={accountId}
          onTurnEnd={() => setWatchlistVersion((v) => v + 1)}
          onOwnStrategy={() => setTab("screener")}
        />
      </div>

      {tab === "screener" && <ScreenerPanel accountId={accountId} />}
      {tab === "watchlist" && <WatchlistPanel accountId={accountId} refreshKey={watchlistVersion} />}
    </div>
  );
}

export default function ResearchPage() {
  return (
    <Suspense>
      <ResearchHub />
    </Suspense>
  );
}
