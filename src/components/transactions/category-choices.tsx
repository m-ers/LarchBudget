"use client";

import { createContext } from "react";
import type { CategoryOptionGroup } from "@/db/transactions";

/**
 * The categories a transaction can be sorted into, the income categories
 * first. Given once for the whole list, so the page does not send them
 * again with every row.
 */
export const CategoryChoices = createContext<CategoryOptionGroup[]>([]);

/** The open accounts, by name: where a transaction can be added, or moved to. */
export const AccountChoices = createContext<{ id: number; name: string }[]>([]);

export function CategoryChoicesProvider({
  groups,
  accounts,
  children,
}: {
  groups: CategoryOptionGroup[];
  accounts: { id: number; name: string }[];
  children: React.ReactNode;
}) {
  return (
    <CategoryChoices value={groups}>
      <AccountChoices value={accounts}>{children}</AccountChoices>
    </CategoryChoices>
  );
}
