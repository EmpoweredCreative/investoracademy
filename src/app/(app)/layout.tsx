import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { SelectedAccountProvider } from "@/contexts/SelectedAccountContext";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SelectedAccountProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-64">
          <div className="p-8 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </SelectedAccountProvider>
  );
}
