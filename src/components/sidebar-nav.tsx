"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";
import { EnvelopeIcon, GearIcon, ListIcon, RulesIcon, UploadIcon, WalletIcon } from "./icons";

const items = [
  { href: "/", label: "nav.budget", icon: EnvelopeIcon },
  { href: "/transactions", label: "nav.transactions", icon: ListIcon },
  { href: "/rules", label: "nav.rules", icon: RulesIcon },
  { href: "/accounts", label: "nav.accounts", icon: WalletIcon },
  { href: "/settings", label: "nav.settings", icon: GearIcon },
] as const;

/**
 * Marks its link while the page it leads to is on its way. A page change
 * waits for the new page, so on a slow connection the link that was clicked
 * lights up at once, and the click is seen to have landed.
 */
function OnItsWay() {
  const { pending } = useLinkStatus();
  return pending ? <span data-on-its-way hidden /> : null;
}

/** `transactionsBadge` shows how many transactions still need sorting. */
export function SidebarNav({ transactionsBadge }: { transactionsBadge?: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[14.5px] font-medium transition-colors ${
              active
                ? "bg-white/10 text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white has-[[data-on-its-way]]:bg-white/10 has-[[data-on-its-way]]:text-white"
            }`}
          >
            <Icon className={active ? "text-accent" : undefined} />
            {t(label)}
            {href === "/transactions" && transactionsBadge}
            <OnItsWay />
          </Link>
        );
      })}

      <Link
        href="/import"
        aria-current={pathname === "/import" ? "page" : undefined}
        className="mt-auto flex items-center justify-center gap-2 rounded-[9px] bg-white px-3 py-2.5 text-[14.5px] font-semibold text-rail transition-opacity hover:opacity-90 has-[[data-on-its-way]]:opacity-80"
      >
        <UploadIcon width={16} height={16} strokeWidth={2} />
        {t("nav.import")}
        <OnItsWay />
      </Link>
    </nav>
  );
}
