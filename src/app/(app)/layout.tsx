import { Suspense } from "react";
import { LogoMark } from "@/components/icons";
import { LogoutButton } from "@/components/logout-button";
import { SidebarNav } from "@/components/sidebar-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 gap-3 p-3">
      <aside className="sticky top-3 flex h-[calc(100vh-1.5rem)] w-51 shrink-0 flex-col gap-6 rounded-2xl bg-rail px-3 pt-5 pb-3.5 text-white">
        <div className="flex items-center gap-2.5 px-2.5 text-xl font-semibold tracking-tight">
          <LogoMark />
          LarchBudget
        </div>
        <Suspense>
          <SidebarNav />
        </Suspense>
        <Suspense>
          <LogoutButton />
        </Suspense>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-3">{children}</main>
    </div>
  );
}
