"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  LogOut,
  Settings,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Link2,
  type LucideIcon,
} from "lucide-react";
import { useLive } from "@/components/live/LiveProvider";
import { AnimatedNumber, DeltaChip, LiveDot, fmtUsd } from "@/components/live/primitives";
import { useSelectedAccount } from "@/contexts/SelectedAccountContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { BrandMark, StackedLogo } from "@/components/BrandMark";
import { APP_NAME } from "@/lib/brand";
import { SECTIONS, activeSection, toolHref, type Section, type SectionTool } from "@/lib/sections";

interface Account {
  id: string;
  name: string;
  mode: string;
}

const isAccountsSection = (path: string) =>
  path === "/accounts" || path.startsWith("/accounts/");

const rowClass = (active: boolean, collapsed: boolean) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    collapsed ? "justify-center px-2" : ""
  } ${
    active
      ? "bg-accent/10 text-accent shadow-[inset_3px_0_0_var(--accent)]"
      : "text-muted hover:text-foreground hover:bg-card-hover"
  }`;

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
  const openSection = activeSection(pathname);

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
      // On an account page, stay on the same tool for the new account
      if (accountIdFromPath) {
        router.push(pathname.replace(/^\/accounts\/[^/]+/, `/accounts/${id}`));
      } else if (isAccountsSection(pathname)) {
        router.push(`/accounts/${id}`);
      }
    } else {
      setSelectedAccountId(null);
    }
  };

  const isToolActive = (section: Section, tool: SectionTool) => {
    if (tool.href) return pathname === tool.href || pathname.startsWith(tool.href + "/");
    if (section.scope === "global") {
      const href = `${section.href}/${tool.slug}`;
      return pathname === href || pathname.startsWith(href + "/");
    }
    if (!effectiveAccountId) return false;
    const base = `/accounts/${effectiveAccountId}`;
    if (!tool.slug) return pathname === base || pathname === base + "/";
    return pathname === `${base}/${tool.slug}` || pathname.startsWith(`${base}/${tool.slug}/`);
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-card border-r border-border flex flex-col z-40 overflow-x-hidden transition-[width] duration-200 ease-out ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo + collapse toggle */}
      <div className={`border-b border-border flex flex-col ${collapsed ? "p-2 items-center gap-2" : "p-6"}`}>
        <div className={`flex items-center ${collapsed ? "flex-col justify-center" : "gap-2"} w-full`}>
          <Link
            href="/dashboard"
            className={collapsed ? "flex justify-center" : "min-w-0 flex-1"}
          >
            {collapsed ? (
              <BrandMark height={28} alt={APP_NAME} />
            ) : (
              <StackedLogo />
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

      {/* Main Nav: Dashboard, then sections. The active section expands to show its tools. */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <NavRow
          href="/dashboard"
          label="Dashboard"
          icon={LayoutDashboard}
          active={pathname === "/dashboard" || pathname.startsWith("/dashboard/")}
          collapsed={collapsed}
        />

        {SECTIONS.map((section) => {
          const open = openSection?.key === section.key;
          return (
            <div key={section.key} className="pt-1">
              <Link
                href={section.href}
                className={`${rowClass(pathname === section.href, collapsed)} ${
                  open && pathname !== section.href ? "text-foreground" : ""
                }`}
                title={collapsed ? section.label : undefined}
              >
                <section.icon className="w-4.5 h-4.5 shrink-0" />
                {!collapsed && (
                  <>
                    {section.label}
                    {open ? (
                      <ChevronDown className="w-3.5 h-3.5 ml-auto opacity-50" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                    )}
                  </>
                )}
              </Link>

              {open && !collapsed && (
                <div className="mt-1 mb-2 ml-[1.15rem] pl-3 border-l border-border space-y-0.5">
                  {section.scope === "account" && (
                    <div className="py-2 pr-1">
                      <select
                        value={currentAccount?.id ?? ""}
                        onChange={handleAccountChange}
                        className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer hover:border-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                        title="Switch account"
                      >
                        <option value="">Select account</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      {currentAccount && <SidebarAccountPulse mode={currentAccount.mode} />}
                    </div>
                  )}
                  {section.groups.map((group) => (
                    <div key={group.label}>
                      {section.groups.length > 1 && (
                        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                          {group.label}
                        </p>
                      )}
                      {group.tools.map((tool) => {
                        const active = isToolActive(section, tool);
                        return (
                          <Link
                            key={tool.slug}
                            href={toolHref(section, tool, effectiveAccountId)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                              active
                                ? "bg-accent/10 text-accent font-medium"
                                : "text-muted hover:text-foreground hover:bg-card-hover"
                            }`}
                          >
                            <tool.icon className="w-4 h-4 shrink-0" />
                            <span className="truncate">{tool.label}</span>
                            {tool.soon && (
                              <span className="ml-auto text-[10px] uppercase tracking-wider text-muted/70">Soon</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

function NavRow({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link href={href} className={rowClass(active, collapsed)} title={collapsed ? label : undefined}>
      <Icon className="w-4.5 h-4.5 shrink-0" />
      {!collapsed && label}
    </Link>
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
