import {
  Activity,
  Building2,
  FileSpreadsheet,
  CreditCard,
  Scale,
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
  /** Only shown to people whose profile includes a business. */
  businessOnly?: boolean;
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
  tagline: "Your budget, debt and net worth — the base everything else is built on.",
  href: "/foundation",
  icon: Layers,
  scope: "global",
  groups: [
    {
      label: "Your money",
      tools: [
        {
          slug: "budget",
          label: "Monthly Budget",
          description: "Your income and regular bills, and what's left over each month.",
          icon: Calculator,
        },
        {
          slug: "debt",
          label: "Debt",
          description: "Every balance and rate, and what you're paying lenders in interest.",
          icon: CreditCard,
        },
        {
          slug: "net-worth",
          label: "Net Worth",
          description: "What you own minus what you owe, and how it changes month to month.",
          icon: Scale,
        },
      ],
    },
    {
      label: "Plan",
      tools: [
        {
          slug: "advisor",
          label: "Advisor",
          description: "Talk through decisions with an AI advisor, using your own numbers.",
          icon: Sparkles,
        },
        {
          slug: "debt-consolidation",
          label: "Debt Consolidation",
          description: "Check whether rolling debts into one loan actually saves you money.",
          icon: Landmark,
        },
        {
          slug: "statements",
          label: "Statements",
          description: "Your cash flow statement and balance sheet, ready to print or share.",
          icon: FileSpreadsheet,
        },
      ],
    },
    {
      label: "Business",
      tools: [
        {
          slug: "business",
          label: "Business P&L",
          description: "Revenue and expenses side by side for three months, with one-time items separated.",
          icon: Building2,
          businessOnly: true,
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

/** A section's groups with tools this profile shouldn't see removed (and empty groups dropped). */
export function visibleGroups(section: Section, hasBusiness: boolean): ToolGroup[] {
  return section.groups
    .map((g) => ({ ...g, tools: g.tools.filter((t) => !t.businessOnly || hasBusiness) }))
    .filter((g) => g.tools.length > 0);
}
