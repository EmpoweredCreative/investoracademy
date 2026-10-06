"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  PieChart,
  BookOpen,
  Microscope,
  Bell,
  RefreshCcw,
  LogOut,
  Settings,
  ChevronRight,
  ChevronLeft,
  FileText,
  Gauge,
  Sparkles,
  LineChart,
  Link2,
} from "lucide-react";
import { useLive } from "@/components/live/LiveProvider";
import { AnimatedNumber, DeltaChip, LiveDot, fmtUsd } from "@/components/live/primitives";
import { useSelectedAccount } from "@/contexts/SelectedAccountContext";
import { useSidebar } from "@/contexts/SidebarContext";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const accountNavItems = [
  { href: "/statement", label: "Statement", icon: FileText },
  { href: "/wheel", label: "Wealth Wheel", icon: PieChart },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/core", label: "Core Premium", icon: RefreshCcw },
];

const tradersCornerNavItems = [
  { href: "/fundamentals", label: "Fundamental Research", icon: Microscope },
  { href: "/research", label: "Trade Research", icon: LineChart },
  { href: "/market-command", label: "Market Command", icon: Gauge },
  { href: "/ai-chart-assist", label: "AI Chart Assist", icon: Sparkles },
];

interface Account {
  id: string;
  name: string;
  mode: string;
}

const isAccountsSection = (path: string) =>
  path === "/accounts" || path.startsWith("/accounts/");

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount();
  const { collapsed, toggleCollapsed } = useSidebar();

  const accountIdFromPath = pathname.match(/^\/accounts\/([^/]+)/)?.[1] ?? null;

  // When viewing an account page, sync selection to that account
  useEffect(() => {
    if (accountIdFromPath) {
      setSelectedAccountId(accountIdFromPath);
    }
  }, [accountIdFromPath, setSelectedAccountId]);

  // Effective account: from URL when on account pages, otherwise from selection
  const effectiveAccountId = accountIdFromPath ?? selectedAccountId;
  const currentAccount = effectiveAccountId
    ? accounts.find((a) => a.id === effectiveAccountId)
    : null;

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleAccountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id) {
      setSelectedAccountId(id);
      // In Accounts section, navigate to that account; otherwise stay put (tools use selection)
      if (isAccountsSection(pathname)) {
        router.push(`/accounts/${id}`);
      }
    } else {
      setSelectedAccountId(null);
    }
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-card border-r border-border flex flex-col z-40 overflow-x-hidden transition-[width] duration-200 ease-out ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo + collapse toggle */}
      <div className={`border-b border-border flex flex-col ${collapsed ? "p-2 items-center gap-2" : "p-6"}`}>
        <div className={`flex items-center ${collapsed ? "flex-col justify-center" : "gap-3"} w-full`}>
          <Link
            href="/dashboard"
            className={`flex items-center gap-3 shrink-0 ${collapsed ? "justify-center" : ""}`}
          >
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-speculation flex items-center justify-center shadow-card">
              <PieChart className="w-4.5 h-4.5 text-white" />
            </div>
            {!collapsed && (
              <span className="leading-tight">
                <span className="block text-[15px] font-semibold tracking-tight">WheelTracker</span>
                <span className="block text-[10px] uppercase tracking-[0.18em] text-muted">Trading desk</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="ml-auto p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* Account switcher + Live/Simulated badge - hidden when collapsed */}
        {!collapsed && (
          <div className="mt-5 flex items-center gap-2 w-full">
            <select
              value={currentAccount?.id ?? ""}
              onChange={handleAccountChange}
              className="flex-1 min-w-0 appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer hover:border-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              title="Switch account"
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {!collapsed && currentAccount && <SidebarAccountPulse mode={currentAccount.mode} />}
      </div>
      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="m-2 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors flex justify-center"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isDashboard = item.href === "/dashboard";
            const href =
              isDashboard && effectiveAccountId
                ? `/accounts/${effectiveAccountId}`
                : item.href;
            const isActive = isDashboard
              ? effectiveAccountId !== null &&
                (pathname === `/accounts/${effectiveAccountId}` ||
                  pathname === `/accounts/${effectiveAccountId}/`)
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-2" : ""
                } ${
                  isActive
                    ? "bg-accent/10 text-accent shadow-[inset_3px_0_0_var(--accent)]"
                    : "text-muted hover:text-foreground hover:bg-card-hover"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-4.5 h-4.5 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </div>

        {!collapsed && (
          <div className="mt-6 mb-2 px-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Account Tools
            </p>
          </div>
        )}
        <div className="space-y-1">
          {accountNavItems.map((item) => {
            const tool = item.href.slice(1);
            const isActive =
              effectiveAccountId &&
              (pathname === `/accounts/${effectiveAccountId}/${tool}` ||
                pathname.startsWith(`/accounts/${effectiveAccountId}/${tool}/`));
            const href = effectiveAccountId
              ? `/accounts/${effectiveAccountId}/${tool}`
              : `/accounts?tool=${tool}`;
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-2" : ""
                } ${
                  isActive
                    ? "bg-accent/10 text-accent shadow-[inset_3px_0_0_var(--accent)]"
                    : "text-muted hover:text-foreground hover:bg-card-hover"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-4.5 h-4.5 shrink-0" />
                {!collapsed && (
                  <>
                    {item.label}
                    <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                  </>
                )}
              </Link>
            );
          })}
        </div>

        {!collapsed && (
          <div className="mt-6 mb-2 px-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Trader&apos;s Corner
            </p>
          </div>
        )}
        <div className="space-y-1">
          {tradersCornerNavItems.map((item) => {
            const tool = item.href.slice(1);
            const isActive =
              effectiveAccountId &&
              (pathname === `/accounts/${effectiveAccountId}/${tool}` ||
                pathname.startsWith(`/accounts/${effectiveAccountId}/${tool}/`));
            const href = effectiveAccountId
              ? `/accounts/${effectiveAccountId}/${tool}`
              : `/accounts?tool=${tool}`;
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-2" : ""
                } ${
                  isActive
                    ? "bg-accent/10 text-accent shadow-[inset_3px_0_0_var(--accent)]"
                    : "text-muted hover:text-foreground hover:bg-card-hover"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-4.5 h-4.5 shrink-0" />
                {!collapsed && (
                  <>
                    {item.label}
                    <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom section */}
      <div className={`border-t border-border space-y-1 ${collapsed ? "p-2" : "p-3"}`}>
        <Link
          href="/connect/schwab"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            collapsed ? "justify-center px-2" : ""
          } ${
            pathname.startsWith("/connect")
              ? "bg-accent/10 text-accent shadow-[inset_3px_0_0_var(--accent)]"
              : "text-muted hover:text-foreground hover:bg-card-hover"
          }`}
          title={collapsed ? "Connect Schwab" : undefined}
        >
          <Link2 className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && "Connections"}
        </Link>
        <Link
          href="/notifications"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors ${
            collapsed ? "justify-center px-2" : ""
          }`}
          title={collapsed ? "Notifications" : undefined}
        >
          <Bell className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && "Notifications"}
        </Link>
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors ${
            collapsed ? "justify-center px-2" : ""
          }`}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && "Settings"}
        </Link>
        <button
          onClick={() => {
            window.location.href = "/api/auth/signout";
          }}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-danger hover:bg-card-hover transition-colors w-full ${
            collapsed ? "justify-center px-2" : ""
          }`}
          title={collapsed ? "Sign Out" : undefined}
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && "Sign Out"}
        </button>
      </div>
    </aside>
  );
}

/** Live mini readout of the selected account under the switcher. */
function SidebarAccountPulse({ mode }: { mode: string }) {
  const { data } = useLive();
  const account = data?.account;
  const live = mode !== "SIMULATED";
  return (
    <div className="mt-3 w-full rounded-xl border border-border bg-background/60 px-3 py-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted font-semibold">
        <span className="flex items-center gap-1.5">
          <LiveDot tone={live ? "success" : "warning"} pulse={live} />
          {live ? "Live" : "Simulated"}
        </span>
        <span>Net liq</span>
      </div>
      {account ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <AnimatedNumber value={account.netLiq} format={(n) => fmtUsd(n, 0)} className="text-base font-semibold" />
          <DeltaChip pct={account.dayChangePct} size="xs" />
        </div>
      ) : (
        <div className="mt-1.5 h-5 rounded bg-border/50 animate-pulse" />
      )}
    </div>
  );
}
