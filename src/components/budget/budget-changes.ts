import type { BudgetMonth, GroupRow, MoneyEnd } from "@/db/budget";
import type { CategoryIcon } from "@/lib/category-icons";

/**
 * A change the budget page shows before the server has confirmed it.
 *
 * Each change holds the new value itself, never a difference: when the
 * server's figures arrive while a save is still under way, the change is
 * applied again on top of them, and must then not count twice.
 */
export type BudgetChange =
  | {
      type: "assign";
      categoryId: number;
      /** The new amount assigned in the viewed month, in minor units. */
      amount: number;
    }
  | {
      /** Whether what comes in through an income category counts for the next month. */
      type: "next-month";
      categoryId: number;
      on: boolean;
    }
  | {
      type: "icon";
      categoryId: number;
      /** The new icon; null for the envelope. */
      icon: CategoryIcon | null;
    }
  | {
      type: "color";
      groupId: number;
      /** The new place in the palette of group colours. */
      slot: number;
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
    case "next-month":
      return nextMonth(budget, change.categoryId, change.on);
    case "icon":
      return setIcon(budget, change.categoryId, change.icon ?? undefined);
    case "color":
      return setColor(budget, change.groupId, change.slot);
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
    // Assigned in this month is one of the parts Ready to assign is made of.
    readyBreakdown: {
      ...budget.readyBreakdown,
      assigned: budget.readyBreakdown.assigned + delta,
    },
  };
}

/**
 * Only the setting shows at once. What the category received depends on
 * transactions in other days, so that comes with the server's figures.
 */
function nextMonth(budget: BudgetMonth, categoryId: number, on: boolean): BudgetMonth {
  const { categories } = budget.income;
  if (!categories.some((c) => c.id === categoryId && c.nextMonth !== on)) return budget;
  return {
    ...budget,
    income: {
      ...budget.income,
      categories: categories.map((c) => (c.id === categoryId ? { ...c, nextMonth: on } : c)),
    },
  };
}

/** An icon changes only the row of its category, expense or income. */
function setIcon(
  budget: BudgetMonth,
  categoryId: number,
  icon: CategoryIcon | undefined,
): BudgetMonth {
  const holds = (categories: { id: number }[]) => categories.some((c) => c.id === categoryId);
  const withIcon = <C extends { id: number }>(categories: C[]) =>
    categories.map((c) => (c.id === categoryId ? { ...c, icon } : c));

  if (holds(budget.income.categories)) {
    return {
      ...budget,
      income: { ...budget.income, categories: withIcon(budget.income.categories) },
    };
  }
  if (!budget.groups.some((group) => holds(group.categories))) return budget;
  return {
    ...budget,
    groups: budget.groups.map((group) =>
      holds(group.categories) ? { ...group, categories: withIcon(group.categories) } : group,
    ),
  };
}

/** A colour changes only its group: the heading and the rows follow it. */
function setColor(budget: BudgetMonth, groupId: number, slot: number): BudgetMonth {
  if (!budget.groups.some((group) => group.id === groupId)) return budget;
  return {
    ...budget,
    groups: budget.groups.map((group) =>
      group.id === groupId ? { ...group, colorSlot: slot } : group,
    ),
  };
}
