import type { BudgetMonth, CategoryRow, GroupRow, MoneyEnd } from "@/db/budget";
import type { CategoryIcon } from "@/lib/category-icons";
import { categoryNeeds, type Target } from "@/lib/targets";

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
    }
  | {
      type: "target";
      categoryId: number;
      /** The new target; null for none. */
      target: Target | null;
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
    case "target":
      return setTarget(budget, change.categoryId, change.target);
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

/**
 * "Assign targets", as the changes it makes: each category whose target
 * needs money gets a new Assigned amount with that added. The needs are
 * the ones shown, worked out as the server works them out.
 */
export function targetChanges(groups: GroupRow[]): BudgetChange[] {
  return groups
    .flatMap((g) => g.categories)
    .filter((c) => c.needed > 0)
    .map((c) => ({ type: "assign" as const, categoryId: c.id, amount: c.assigned + c.needed }));
}

/**
 * Assigning moves money between Ready to assign and one category. What its
 * target needs follows from the new amount.
 */
function assign(budget: BudgetMonth, categoryId: number, amount: number): BudgetMonth {
  const category = budget.groups.flatMap((g) => g.categories).find((c) => c.id === categoryId);
  if (!category) return budget;
  const delta = amount - category.assigned;

  return withCategory(budget, category, {
    assigned: amount,
    available: category.available + delta,
    balance: category.balance + delta,
  });
}

/** A new target changes only what its category, and so the month, still needs. */
function setTarget(budget: BudgetMonth, categoryId: number, target: Target | null): BudgetMonth {
  const category = budget.groups.flatMap((g) => g.categories).find((c) => c.id === categoryId);
  if (!category) return budget;
  return withCategory(budget, category, { target });
}

/**
 * The month with one category changed, and every figure that adds it up
 * moved along: its group, the totals, Ready to assign, and what the
 * targets need, worked out again for the category.
 */
function withCategory(
  budget: BudgetMonth,
  category: CategoryRow,
  change: Partial<Pick<CategoryRow, "assigned" | "available" | "balance" | "target">>,
): BudgetMonth {
  const changed = { ...category, ...change };
  changed.needed = categoryNeeds(changed, budget.month, budget.thisMonth);
  const assigned = changed.assigned - category.assigned;
  const available = changed.available - category.available;
  const balance = changed.balance - category.balance;

  return {
    ...budget,
    groups: budget.groups.map((group) =>
      group.categories.includes(category)
        ? {
            ...group,
            assigned: group.assigned + assigned,
            available: group.available + available,
            categories: group.categories.map((c) => (c === category ? changed : c)),
          }
        : group,
    ),
    totals: {
      ...budget.totals,
      assigned: budget.totals.assigned + assigned,
      available: budget.totals.available + available,
    },
    readyToAssign: budget.readyToAssign - balance,
    // Assigned in this month is one of the parts Ready to assign is made of.
    readyBreakdown: {
      ...budget.readyBreakdown,
      assigned: budget.readyBreakdown.assigned + assigned,
    },
    needed: budget.needed + changed.needed - category.needed,
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
