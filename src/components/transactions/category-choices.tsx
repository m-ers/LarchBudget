"use client";

import { createContext } from "react";
import type { CategoryOptionGroup } from "@/db/transactions";

/**
 * The categories a transaction can be sorted into, the income categories
 * first. Given once for the whole list, so the page does not send them
 * again with every row.
 */
export const CategoryChoices = createContext<CategoryOptionGroup[]>([]);

export function CategoryChoicesProvider({
  groups,
  children,
}: {
  groups: CategoryOptionGroup[];
  children: React.ReactNode;
}) {
  return <CategoryChoices value={groups}>{children}</CategoryChoices>;
}
