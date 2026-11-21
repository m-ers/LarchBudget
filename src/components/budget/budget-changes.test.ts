import { describe, expect, it } from "vitest";
import type { BudgetMonth } from "@/db/budget";
import type { CategoryIcon } from "@/lib/category-icons";
import { readyLines } from "../../lib/ready";
import { applyChange, moveChanges, type BudgetChange } from "./budget-changes";

/**
 * Two groups. Rent has 300.00 left from earlier months and 50.00 spent this
 * month; Water has 20.00 more assigned in a later month. A salary came in
 * through the income category Salary.
 */
const budget: BudgetMonth = {
  groups: [
    {
      id: 1,
      name: "Fixed costs",
      colorSlot: 0,
      categories: [
        {
          id: 10,
          name: "Rent",
          assigned: 100_000,
          activity: -5_000,
          available: 125_000,
          balance: 125_000,
        },
        { id: 11, name: "Water", assigned: 2_000, activity: 0, available: 2_000, balance: 4_000 },
      ],
      assigned: 102_000,
      activity: -5_000,
      available: 127_000,
    },
    {
      id: 2,
      name: "Goals",
      colorSlot: 1,
      categories: [{ id: 20, name: "Holiday", assigned: 0, activity: 0, available: 0, balance: 0 }],
      assigned: 0,
      activity: 0,
      available: 0,
    },
  ],
  income: {
    categories: [{ id: 30, name: "Salary", received: 285_000, nextMonth: false }],
    received: 285_000,
  },
  totals: { assigned: 102_000, spent: 5_000, available: 127_000 },
  readyToAssign: 50_000,
  // Before this month, 1,310.00 more was assigned than had come in.
  readyBreakdown: {
    leftOver: -131_000,
    received: 285_000,
    withoutCategory: 0,
    assigned: 102_000,
    assignedLater: 2_000,
    alreadyIn: 0,
    beyondNextMonth: false,
  },
  hasAccounts: true,
  assignedLastMonth: false,
};

/** What the lines of Ready to assign's sum add up to. */
const sum = (month: BudgetMonth) =>
  readyLines(month.readyBreakdown).reduce((total, line) => total + line.amount, 0);

const assign = (categoryId: number, amount: number): BudgetChange => ({
  type: "assign",
  categoryId,
  amount,
});

describe("assigning, before the server confirms it", () => {
  it("moves the difference between Ready to assign and the category, its group and the totals", () => {
    const after = applyChange(budget, assign(10, 120_000));
    expect(after.groups[0].categories[0]).toEqual({
      id: 10,
      name: "Rent",
      assigned: 120_000,
      activity: -5_000,
      available: 145_000,
      balance: 145_000,
    });
    expect(after.groups[0]).toMatchObject({
      assigned: 122_000,
      activity: -5_000,
      available: 147_000,
    });
    expect(after.totals).toEqual({ assigned: 122_000, spent: 5_000, available: 147_000 });
    expect(after.readyToAssign).toBe(30_000);
  });

  it("keeps the parts of Ready to assign adding up to it", () => {
    expect(sum(budget)).toBe(budget.readyToAssign);
    for (const change of [assign(10, 120_000), assign(11, 0), assign(20, -5_000)]) {
      const after = applyChange(budget, change);
      expect(after.readyBreakdown).toEqual({
        ...budget.readyBreakdown,
        assigned: after.totals.assigned,
      });
      expect(sum(after)).toBe(after.readyToAssign);
    }
  });

  it("leaves other categories and groups as they are", () => {
    const after = applyChange(budget, assign(10, 120_000));
    expect(after.groups[0].categories[1]).toBe(budget.groups[0].categories[1]);
    expect(after.groups[1]).toBe(budget.groups[1]);
  });

  it("can take money back out", () => {
    const after = applyChange(budget, assign(11, 0));
    expect(after.groups[0].categories[1]).toMatchObject({
      assigned: 0,
      available: 0,
      balance: 2_000,
    });
    expect(after.readyToAssign).toBe(52_000);
  });

  it("does not count twice once the server's figures already hold the change", () => {
    const once = applyChange(budget, assign(20, 25_000));
    expect(applyChange(once, assign(20, 25_000))).toEqual(once);
  });

  it("keeps the last of several changes to one category", () => {
    const after = [assign(20, 10_000), assign(10, 90_000), assign(20, 25_000)].reduce(
      applyChange,
      budget,
    );
    expect(after.groups[1].categories[0]).toMatchObject({ assigned: 25_000, available: 25_000 });
    expect(after.groups[0].categories[0]).toMatchObject({ assigned: 90_000, available: 115_000 });
    expect(after.readyToAssign).toBe(50_000 - 25_000 + 10_000);
  });

  it("changes nothing for a category that is not on the page", () => {
    expect(applyChange(budget, assign(99, 5_000))).toBe(budget);
  });

  it("changes nothing for an income category, which holds no money", () => {
    expect(applyChange(budget, assign(30, 5_000))).toBe(budget);
    expect(applyChange(budget, assign(10, 120_000)).income).toBe(budget.income);
  });
});

describe("moving money, before the server confirms it", () => {
  const move = (from: number | "ready", to: number | "ready", amount: number) =>
    moveChanges(budget.groups, { from, to, amount }).reduce(applyChange, budget);

  it("between two categories moves it between them, and leaves Ready to assign", () => {
    const after = move(10, 20, 30_000);
    expect(after.groups[0].categories[0]).toMatchObject({ assigned: 70_000, available: 95_000 });
    expect(after.groups[1].categories[0]).toMatchObject({ assigned: 30_000, available: 30_000 });
    expect(after.groups.map((g) => g.available)).toEqual([97_000, 30_000]);
    expect(after.totals).toEqual(budget.totals);
    expect(after.readyToAssign).toBe(50_000);
  });

  it("with Ready to assign at one end changes only the category and Ready to assign", () => {
    const covered = move("ready", 11, 5_000);
    expect(covered.groups[0].categories[1]).toMatchObject({ assigned: 7_000, available: 7_000 });
    expect(covered.readyToAssign).toBe(45_000);

    const freed = move(10, "ready", 100_000);
    expect(freed.groups[0].categories[0]).toMatchObject({ assigned: 0, available: 25_000 });
    expect(freed.readyToAssign).toBe(150_000);
    // The sum that explains it follows.
    expect(covered.readyBreakdown.assigned).toBe(107_000);
    expect(freed.readyBreakdown.assigned).toBe(2_000);
    expect([covered, freed].map(sum)).toEqual([45_000, 150_000]);
  });

  it("does not count twice once the server's figures already hold the move", () => {
    const once = move(10, 20, 30_000);
    const changes = moveChanges(budget.groups, { from: 10, to: 20, amount: 30_000 });
    expect(changes.reduce(applyChange, once)).toEqual(once);
  });
});

describe("counting income for the next month, before the server confirms it", () => {
  const nextMonth = (categoryId: number, on: boolean): BudgetChange => ({
    type: "next-month",
    categoryId,
    on,
  });

  it("shows the setting at once, and leaves what was received to the server", () => {
    const after = applyChange(budget, nextMonth(30, true));
    expect(after.income).toEqual({
      categories: [{ id: 30, name: "Salary", received: 285_000, nextMonth: true }],
      received: 285_000,
    });
    expect(after.groups).toBe(budget.groups);
    expect(after.readyToAssign).toBe(budget.readyToAssign);
    expect(applyChange(after, nextMonth(30, false))).toEqual(budget);
  });

  it("changes nothing when the setting is already so, or the category is not an income category", () => {
    expect(applyChange(budget, nextMonth(30, false))).toBe(budget);
    expect(applyChange(budget, nextMonth(10, true))).toBe(budget);
    expect(applyChange(budget, nextMonth(99, true))).toBe(budget);
  });
});

describe("choosing a colour, before the server confirms it", () => {
  const color = (groupId: number, slot: number): BudgetChange => ({ type: "color", groupId, slot });

  it("changes the colour of that one group, and no figure", () => {
    const after = applyChange(budget, color(1, 4));
    expect(after.groups.map((g) => g.colorSlot)).toEqual([4, 1]);
    expect(after.groups[0].categories).toBe(budget.groups[0].categories);
    expect(after.totals).toBe(budget.totals);
  });

  it("is the same applied twice, and ignores a group that is not there", () => {
    expect(applyChange(applyChange(budget, color(2, 5)), color(2, 5)).groups[1].colorSlot).toBe(5);
    expect(applyChange(budget, color(99, 5))).toBe(budget);
  });
});

describe("choosing an icon, before the server confirms it", () => {
  const icon = (categoryId: number, id: CategoryIcon | null): BudgetChange => ({
    type: "icon",
    categoryId,
    icon: id,
  });

  it("changes the icon of that one row, and no figure", () => {
    const after = applyChange(budget, icon(10, "house"));
    expect(after.groups[0].categories[0]).toEqual({
      ...budget.groups[0].categories[0],
      icon: "house",
    });
    expect(after.groups[0].categories[1]).toBe(budget.groups[0].categories[1]);
    expect(after.groups[1]).toBe(budget.groups[1]);
    expect(after.income).toBe(budget.income);
    expect({ ...after, groups: budget.groups }).toEqual(budget);
  });

  it("works for an income category", () => {
    const after = applyChange(budget, icon(30, "briefcase"));
    expect(after.income.categories[0].icon).toBe("briefcase");
    expect(after.income.received).toBe(285_000);
    expect(after.groups).toBe(budget.groups);
  });

  it("goes back to the envelope with null", () => {
    const after = [icon(20, "tree-palm"), icon(20, null)].reduce(applyChange, budget);
    expect(after.groups[1].categories[0].icon).toBeUndefined();
  });

  it("changes nothing for a category that is not on the page", () => {
    expect(applyChange(budget, icon(99, "house"))).toBe(budget);
  });
});
