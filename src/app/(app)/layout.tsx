import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { SelectedAccountProvider } from "@/contexts/SelectedAccountContext";
import { SidebarProvider } from "@/contexts/SidebarContext";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SelectedAccountProvider>
      <SidebarProvider>
        <div className="flex min-h-screen">
          <AppShell>{children}</AppShell>
        </div>
      </SidebarProvider>
    </SelectedAccountProvider>
  );
}
