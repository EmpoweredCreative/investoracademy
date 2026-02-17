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
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useSelectedAccount } from "@/contexts/SelectedAccountContext";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const accountNavItems = [
  { href: "/statement", label: "Statement", icon: FileText },
  { href: "/wheel", label: "Wealth Wheel", icon: PieChart },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/reinvest", label: "Reinvest", icon: RefreshCcw },
];

const tradersCornerNavItems = [
  { href: "/research", label: "Research", icon: Microscope },
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
    <aside className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <PieChart className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">WheelTracker</span>
        </Link>
        {/* Account switcher + Live/Simulated badge */}
        <div className="mt-4 flex items-center gap-2">
          <select
            value={currentAccount?.id ?? ""}
            onChange={handleAccountChange}
            className="flex-1 min-w-0 appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer hover:border-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            title="Switch account"
          >
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {currentAccount && (
            <Badge
              variant={currentAccount.mode === "SIMULATED" ? "warning" : "success"}
              className="shrink-0 text-[10px]"
            >
              {currentAccount.mode === "SIMULATED" ? "Simulated" : "Live"}
            </Badge>
          )}
        </div>
      </div>

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
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:text-foreground hover:bg-card-hover"
                }`}
              >
                <item.icon className="w-4.5 h-4.5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-6 mb-2 px-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Account Tools
          </p>
        </div>
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
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:text-foreground hover:bg-card-hover"
                }`}
              >
                <item.icon className="w-4.5 h-4.5" />
                {item.label}
                <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
              </Link>
            );
          })}
        </div>

        <div className="mt-6 mb-2 px-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Trader&apos;s Corner
          </p>
        </div>
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
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:text-foreground hover:bg-card-hover"
                }`}
              >
                <item.icon className="w-4.5 h-4.5" />
                {item.label}
                <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-border space-y-1">
        <Link
          href="/notifications"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors"
        >
          <Bell className="w-4.5 h-4.5" />
          Notifications
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors"
        >
          <Settings className="w-4.5 h-4.5" />
          Settings
        </Link>
        <button
          onClick={() => {
            window.location.href = "/api/auth/signout";
          }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-danger hover:bg-card-hover transition-colors w-full"
        >
          <LogOut className="w-4.5 h-4.5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
