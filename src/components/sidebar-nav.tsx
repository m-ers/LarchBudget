"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EnvelopeIcon, WalletIcon } from "./icons";

const items = [
  { href: "/", label: "Budget", icon: EnvelopeIcon },
  { href: "/accounts", label: "Accounts", icon: WalletIcon },
];

export function SidebarNav() {
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
          </Link>
        );
      })}
    </nav>
  );
}
