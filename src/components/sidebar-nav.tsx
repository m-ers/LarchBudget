"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EnvelopeIcon, ListIcon, UploadIcon, WalletIcon } from "./icons";

const items = [
  { href: "/", label: "Budget", icon: EnvelopeIcon },
  { href: "/transactions", label: "Transactions", icon: ListIcon },
  { href: "/accounts", label: "Accounts", icon: WalletIcon },
];

/** `transactionsBadge` shows how many transactions still need sorting. */
export function SidebarNav({ transactionsBadge }: { transactionsBadge?: React.ReactNode }) {
  const pathname = usePathname();

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
              active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className={active ? "text-accent" : undefined} />
            {label}
            {href === "/transactions" && transactionsBadge}
          </Link>
        );
      })}

      <Link
        href="/import"
        aria-current={pathname === "/import" ? "page" : undefined}
        className="mt-auto flex items-center justify-center gap-2 rounded-[9px] bg-white px-3 py-2.5 text-[14.5px] font-semibold text-rail transition-opacity hover:opacity-90"
      >
        <UploadIcon width={16} height={16} strokeWidth={2} />
        Import from bank
      </Link>
    </nav>
  );
}
