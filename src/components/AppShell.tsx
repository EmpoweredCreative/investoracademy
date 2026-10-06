"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useSidebar } from "@/contexts/SidebarContext";
import { useSelectedAccount } from "@/contexts/SelectedAccountContext";
import { LiveProvider } from "@/components/live/LiveProvider";
import { LiveWire, StatusBar } from "@/components/live/StatusBar";

export default function AppShell({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  const pathname = usePathname();
  const { selectedAccountId } = useSelectedAccount();
  // The dashboard is cross-account; everywhere else the feed follows the current account.
  const accountId =
    pathname.match(/^\/accounts\/([^/]+)/)?.[1] ?? (pathname.startsWith("/dashboard") ? null : selectedAccountId);

  return (
    <LiveProvider accountId={accountId}>
      <Sidebar />
      <main
        className="flex-1 min-w-0 transition-[margin] duration-200 ease-out"
        style={{ marginLeft: collapsed ? 64 : 256 }}
      >
        <div className="sticky top-0 z-30">
          <StatusBar />
          <LiveWire />
        </div>
        <div className="p-6 lg:p-8 max-w-[1920px] mx-auto">{children}</div>
      </main>
    </LiveProvider>
  );
}
