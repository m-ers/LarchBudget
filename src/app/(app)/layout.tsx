import { Suspense } from "react";
import { PageSkeleton } from "@/components/hero";
import { LogoMark } from "@/components/icons";
import { LogoutButton } from "@/components/logout-button";
import { SidebarNav } from "@/components/sidebar-nav";
import { ToSortBadge } from "@/components/to-sort-badge";

/**
 * Going from one page to another waits for the new page instead of showing
 * a loading skeleton first. The server answers in a few milliseconds, and
 * React keeps a skeleton on screen for at least 300 ms once it has shown
 * one, so a skeleton per page made every first visit feel slow. The one
 * loading boundary sits here, above the pages: it shows on a fresh page
 * load, and stays out of the way when moving between pages.
 *
 * Next.js checks every page on its own for this, so each page under this
 * layout says `instant = false` too. Without it, `next dev` reports the
 * page for "uncached data".
 */
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 gap-3 p-3">
      <aside className="sticky top-3 flex h-[calc(100vh-1.5rem)] w-51 shrink-0 flex-col gap-6 rounded-2xl bg-rail px-3 pt-5 pb-3.5 text-white [--focus-ring:white]">
        <div className="flex items-center gap-2.5 px-2.5 text-xl font-semibold tracking-tight">
          <LogoMark />
          LarchBudget
        </div>
        <Suspense>
          <SidebarNav
            transactionsBadge={
              <Suspense>
                <ToSortBadge />
              </Suspense>
            }
          />
        </Suspense>
        <Suspense>
          <LogoutButton />
        </Suspense>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </main>
    </div>
  );
}
