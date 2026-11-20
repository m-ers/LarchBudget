import type { BudgetMonth, GroupRow, MoneyEnd } from "@/db/budget";

/**
 * A change the budget page shows before the server has confirmed it.
 *
 * Each change holds the new value itself, never a difference: when the
 * server's figures arrive while a save is still under way, the change is
 * applied again on top of them, and must then not count twice.
 */
export type BudgetChange = {
  type: "assign";
  categoryId: number;
  /** The new amount assigned in the viewed month, in minor units. */
  amount: number;
};

/**
 * The budget month as it will be once `change` is saved. The server's
 * figures stay the truth: this only shifts the ones a change moves, by the
 * difference it makes. Nothing that comes from transactions is touched.
 */
export function applyChange(budget: BudgetMonth, change: BudgetChange): BudgetMonth {
  switch (change.type) {
    case "assign":
      return assign(budget, change.categoryId, change.amount);
  }
}

/**
 * Moving money, as the changes it makes: a new Assigned amount for the
 * category at each end. Ready to assign follows from those, as it does
 * when an amount is typed, so it stays put when both ends are categories.
 */
export function moveChanges(
  groups: GroupRow[],
  { from, to, amount }: { from: MoneyEnd; to: MoneyEnd; amount: number },
): BudgetChange[] {
  const categories = groups.flatMap((g) => g.categories);
  return [
    { end: from, delta: -amount },
    { end: to, delta: amount },
  ].flatMap(({ end, delta }) => {
    const category = categories.find((c) => c.id === end);
    return category
      ? [{ type: "assign" as const, categoryId: category.id, amount: category.assigned + delta }]
      : [];
  });
}

/** Assigning moves money between Ready to assign and one category. */
function assign(budget: BudgetMonth, categoryId: number, amount: number): BudgetMonth {
  const category = budget.groups.flatMap((g) => g.categories).find((c) => c.id === categoryId);
  if (!category) return budget;
  const delta = amount - category.assigned;

  return {
    ...budget,
    groups: budget.groups.map((group) =>
      group.categories.includes(category)
        ? {
            ...group,
            assigned: group.assigned + delta,
            available: group.available + delta,
            categories: group.categories.map((c) =>
              c === category
                ? {
                    ...c,
                    assigned: amount,
                    available: c.available + delta,
                    balance: c.balance + delta,
                  }
                : c,
            ),
          }
        : group,
    ),
    totals: {
      ...budget.totals,
      assigned: budget.totals.assigned + delta,
      available: budget.totals.available + delta,
    },
    readyToAssign: budget.readyToAssign - delta,
  };
}
