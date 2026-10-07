import {
  Activity,
  BookOpen,
  Briefcase,
  Calculator,
  FileText,
  Gauge,
  Landmark,
  LineChart,
  Microscope,
  PieChart,
  RefreshCcw,
  Sparkles,
  Layers,
  CandlestickChart,
  type LucideIcon,
} from "lucide-react";

/**
 * Top-level app sections. Each section has a hub page (its snapshot) and a set
 * of tools. The sidebar shows sections only; the active section expands to
 * reveal its tools.
 */

export interface SectionTool {
  /** Path segment. Account tools live at /accounts/[id]/<slug> ("" = account home). */
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tool is planned but not built yet. */
  soon?: boolean;
  /** Fixed URL for a tool that isn't tied to an account. */
  href?: string;
}

export interface ToolGroup {
  label: string;
  tools: SectionTool[];
}

export interface Section {
  key: "foundation" | "traders-corner";
  label: string;
  tagline: string;
  href: string;
  icon: LucideIcon;
  /** Account-scoped tools resolve against the selected account. */
  scope: "global" | "account";
  groups: ToolGroup[];
}

export const FOUNDATION: Section = {
  key: "foundation",
  label: "Foundation",
  tagline: "Budget, debt, and the cash flow everything else is built on.",
  href: "/foundation",
  icon: Layers,
  scope: "global",
  groups: [
    {
      label: "Plan",
      tools: [
        {
          slug: "budget",
          label: "Build Your Budget",
          description: "Map income to spending, savings, and goals every month.",
          icon: Calculator,
          soon: true,
        },
        {
          slug: "debt-consolidation",
          label: "Debt Consolidation",
          description: "See every balance in one place and find the fastest payoff path.",
          icon: Landmark,
          soon: true,
        },
      ],
    },
  ],
};

export const TRADERS_CORNER: Section = {
  key: "traders-corner",
  label: "Trader's Corner",
  tagline: "Research, track, and manage your investment accounts.",
  href: "/traders-corner",
  icon: CandlestickChart,
  scope: "account",
  groups: [
    {
      label: "Track",
      tools: [
        { slug: "", label: "Portfolio", description: "Positions, cost basis, and option trades.", icon: Briefcase },
        { slug: "statement", label: "Statement", description: "Account statement and cash ledger.", icon: FileText },
        { slug: "wheel", label: "Wealth Wheel", description: "Allocation across your buckets.", icon: PieChart },
        { slug: "journal", label: "Journal", description: "Log trades and review what worked.", icon: BookOpen },
        { slug: "core", label: "Core Premium", description: "Premium income on your core holdings.", icon: RefreshCcw },
      ],
    },
    {
      label: "Research",
      tools: [
        { slug: "fundamentals", label: "Research", description: "Fundamentals, filings, and the WealthOS Score.", icon: Microscope },
        { slug: "research", label: "Trade Research", description: "Screen and size trade ideas.", icon: LineChart },
        { slug: "market-command", label: "Market Command", description: "Market regime and sector read.", icon: Gauge },
        { slug: "ai-chart-assist", label: "AI Chart Assist", description: "Upload a chart and get a technical read.", icon: Sparkles },
        {
          slug: "economy",
          label: "Economy",
          description: "Inflation, jobs, Fed policy, Treasury yields, and the release calendar.",
          icon: Activity,
          href: "/traders-corner/economy",
        },
      ],
    },
  ],
};

export const SECTIONS: Section[] = [FOUNDATION, TRADERS_CORNER];

export function sectionTools(section: Section): SectionTool[] {
  return section.groups.flatMap((g) => g.tools);
}

/** Resolve a tool's URL. Account tools without a selected account go through the account picker. */
export function toolHref(section: Section, tool: SectionTool, accountId: string | null): string {
  if (tool.href) return tool.href;
  if (section.scope === "global") return `${section.href}/${tool.slug}`;
  if (!accountId) return tool.slug ? `/accounts?tool=${tool.slug}` : "/accounts";
  return tool.slug ? `/accounts/${accountId}/${tool.slug}` : `/accounts/${accountId}`;
}

/** Which section owns the current path, if any. */
export function activeSection(pathname: string): Section | null {
  if (pathname === FOUNDATION.href || pathname.startsWith(FOUNDATION.href + "/")) return FOUNDATION;
  if (
    pathname === TRADERS_CORNER.href ||
    pathname.startsWith(TRADERS_CORNER.href + "/") ||
    pathname === "/accounts" ||
    pathname.startsWith("/accounts/")
  ) {
    return TRADERS_CORNER;
  }
  return null;
}

/** Labels for account tools, keyed by slug (used by the account picker). */
export const ACCOUNT_TOOL_LABELS: Record<string, string> = Object.fromEntries(
  sectionTools(TRADERS_CORNER)
    .filter((t) => t.slug && !t.href)
    .map((t) => [t.slug, t.label])
);
