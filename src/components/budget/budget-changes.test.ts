import { describe, expect, it } from "vitest";
import type { BudgetMonth } from "@/db/budget";
import { applyChange, type BudgetChange } from "./budget-changes";

/**
 * Two groups. Rent has 300.00 left from earlier months and 50.00 spent this
 * month; Water has 20.00 more assigned in a later month.
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
  totals: { assigned: 102_000, spent: 5_000, available: 127_000 },
  readyToAssign: 50_000,
  hasAccounts: true,
};

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
});
