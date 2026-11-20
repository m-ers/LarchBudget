"use client";

import { createContext, use } from "react";
import type { BudgetMonth } from "@/db/budget";
import type { Month } from "@/lib/dates";
import type { BudgetChange } from "./budget-changes";

type Budget = {
  /** The month on screen. */
  month: Month;
  currency: string;
  locale: string;
  /** The month's figures as shown, with changes still being saved. */
  figures: BudgetMonth;
  /**
   * Shows a change on the page straight away. Call it only from the
   * `showAtOnce` step of the `save` that stores it: the change then lasts
   * until that save and the refreshed page are both in, or ends with a
   * failed save, which puts the old figures back.
   */
  show: (change: BudgetChange) => void;
};

export const BudgetContext = createContext<Budget | null>(null);

/** What every part of the budget table shares. Only inside `BudgetView`. */
export function useBudget(): Budget {
  const budget = use(BudgetContext);
  if (!budget) throw new Error("useBudget is only for components inside BudgetView.");
  return budget;
}
