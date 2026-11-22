import { describe, expect, it } from "vitest";
import { openDb } from "@/db";
import { createAccount } from "@/db/accounts";
import {
  archiveCategory,
  assignTargets,
  createCategory,
  createGroup,
  createIncomeCategory,
  getBudgetMonth,
  removeTarget,
  restoreCategory,
  setAssigned,
  setTarget,
  type BudgetMonth,
} from "@/db/budget";
import { created } from "@/db/created";
import { transactions } from "@/db/schema";
import type { CategoryIcon } from "@/lib/category-icons";
import type { IsoDate, Month } from "@/lib/dates";
import type { Target } from "@/lib/targets";
import { readyLines } from "../../lib/ready";
import { applyChange, moveChanges, targetChanges, type BudgetChange } from "./budget-changes";

/**
 * November 2026, the current month. Two groups. Rent has 300.00 left from
 * earlier months and 50.00 spent this month; Water has 20.00 more assigned
 * in a later month. A salary came in through the income category Salary.
 * No category has a target.
 */
const budget: BudgetMonth = {
  month: "2026-11",
  thisMonth: "2026-11",
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
          target: null,
          needed: 0,
        },
        {
          id: 11,
          name: "Water",
          assigned: 2_000,
          activity: 0,
          available: 2_000,
          balance: 4_000,
          target: null,
          needed: 0,
        },
      ],
      assigned: 102_000,
      activity: -5_000,
      available: 127_000,
    },
    {
      id: 2,
      name: "Goals",
      colorSlot: 1,
      categories: [
        {
          id: 20,
          name: "Holiday",
          assigned: 0,
          activity: 0,
          available: 0,
          balance: 0,
          target: null,
          needed: 0,
        },
      ],
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
  needed: 0,
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
      target: null,
      needed: 0,
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

describe("targets, before the server confirms them", () => {
  const target = (categoryId: number, value: Target | null): BudgetChange => ({
    type: "target",
    categoryId,
    target: value,
  });
  const needs = (month: BudgetMonth) =>
    month.groups.flatMap((g) => g.categories.map((c) => [c.name, c.needed]));

  /**
   * Rent: €1,100 every month, with €1,000 assigned. Water: top up to €50,
   * with €20 assigned and nothing from last month. Holiday: €1,200 by June
   * 2027, eight months away including this one.
   */
  const withTargets = [
    target(10, { kind: "monthly", amount: 110_000 }),
    target(11, { kind: "topUp", amount: 5_000 }),
    target(20, { kind: "byMonth", amount: 120_000, month: "2027-06" }),
  ].reduce(applyChange, budget);

  it("show what a new target needs, and change no other figure", () => {
    expect(needs(withTargets)).toEqual([
      ["Rent", 10_000],
      ["Water", 3_000],
      ["Holiday", 15_000],
    ]);
    expect(withTargets.needed).toBe(28_000);
    expect(withTargets.groups[0].categories[0].target).toEqual({
      kind: "monthly",
      amount: 110_000,
    });
    expect(withTargets.readyToAssign).toBe(budget.readyToAssign);
    expect(withTargets.totals).toEqual(budget.totals);
    expect(withTargets.groups.map((g) => g.assigned)).toEqual([102_000, 0]);
  });

  it("need nothing once a target is removed", () => {
    const after = applyChange(withTargets, target(10, null));
    expect(after.groups[0].categories[0]).toMatchObject({ target: null, needed: 0 });
    expect(after.needed).toBe(18_000);
  });

  it("is the same applied twice, and ignores a category that is not there", () => {
    const change = target(20, { kind: "monthly", amount: 4_000 });
    const once = applyChange(withTargets, change);
    expect(applyChange(once, change)).toEqual(once);
    expect(once.needed).toBe(10_000 + 3_000 + 4_000);
    expect(applyChange(budget, target(99, { kind: "monthly", amount: 4_000 }))).toBe(budget);
  });

  it("follow what is typed into Assigned", () => {
    const some = applyChange(withTargets, assign(10, 105_000));
    expect(some.groups[0].categories[0].needed).toBe(5_000);
    expect(some.needed).toBe(23_000);
    const met = applyChange(withTargets, assign(10, 130_000));
    expect(met.groups[0].categories[0].needed).toBe(0);
    expect(met.needed).toBe(18_000);
  });

  it("need nothing in a month that is over", () => {
    const october = { ...budget, month: "2026-10" as const };
    const after = applyChange(october, target(20, { kind: "monthly", amount: 4_000 }));
    expect(after.groups[1].categories[0].needed).toBe(0);
    expect(after.needed).toBe(0);
  });

  describe("assigning them all", () => {
    const changes = targetChanges(withTargets.groups);
    const after = changes.reduce(applyChange, withTargets);

    it("adds what each category needs to its Assigned amount", () => {
      expect(changes).toEqual([
        { type: "assign", categoryId: 10, amount: 110_000 },
        { type: "assign", categoryId: 11, amount: 5_000 },
        { type: "assign", categoryId: 20, amount: 15_000 },
      ]);
      expect(after.groups.flatMap((g) => g.categories.map((c) => c.assigned))).toEqual([
        110_000, 5_000, 15_000,
      ]);
    });

    it("moves every figure along at once, and leaves nothing needed", () => {
      expect(needs(after)).toEqual([
        ["Rent", 0],
        ["Water", 0],
        ["Holiday", 0],
      ]);
      expect(after.needed).toBe(0);
      expect(after.groups.map((g) => g.assigned)).toEqual([115_000, 15_000]);
      expect(after.totals.assigned).toBe(budget.totals.assigned + 28_000);
      expect(after.readyToAssign).toBe(50_000 - 28_000);
      expect(sum(after)).toBe(after.readyToAssign);
    });

    it("assigns more than there is, and Ready to assign goes below zero", () => {
      const short = applyChange(withTargets, target(20, { kind: "monthly", amount: 60_000 }));
      const all = targetChanges(short.groups).reduce(applyChange, short);
      expect(all.needed).toBe(0);
      expect(all.readyToAssign).toBe(50_000 - 10_000 - 3_000 - 60_000);
    });

    it("does not count twice once the server's figures already hold it", () => {
      expect(changes.reduce(applyChange, after)).toEqual(after);
      expect(targetChanges(after.groups)).toEqual([]);
    });
  });
});

describe("targets and amounts, against the server's figures for random budgets", () => {
  // Seen in November 2026: September and October are over.
  const NOW: Month = "2026-11";
  const MONTHS: Month[] = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);

  /** Random numbers that come out the same for the same seed. */
  function random(seed: number) {
    let state = seed >>> 0;
    const next = () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 2 ** 32;
    };
    const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));
    return {
      int,
      chance: (probability: number) => next() < probability,
      pick: <T>(list: readonly T[]) => list[int(0, list.length - 1)],
    };
  }
  type Random = ReturnType<typeof random>;

  function randomTarget(r: Random): Target | null {
    switch (r.int(0, 3)) {
      case 0:
        return null;
      case 1:
        return { kind: "monthly", amount: r.int(1, 90_000) };
      case 2:
        return { kind: "topUp", amount: r.int(1, 90_000) };
      default:
        return {
          kind: "byMonth",
          amount: r.int(1, 900_000),
          month: r.pick([...MONTHS, "2027-06"]),
        };
    }
  }

  /**
   * Four categories in two groups, each with a random target or none, and
   * amounts assigned (some below zero, as after moving money out) and spent
   * at random over five months; some archived, some of those restored. A
   * salary came in through an income category.
   */
  function randomBudget(r: Random) {
    const db = openDb(":memory:");
    const groups = [created(createGroup(db, "Bills")), created(createGroup(db, "Goals"))];
    const account = created(
      createAccount(db, {
        name: "Checking",
        type: "checking",
        startingBalance: 50_000,
        balanceDate: "2026-09-01",
      }),
    );
    const spend = (categoryId: number, date: IsoDate, amount: number) =>
      db.insert(transactions).values({ accountId: account, categoryId, date, amount }).run();

    const ids = [0, 1, 2, 3].map((i) => created(createCategory(db, `C${i}`, r.pick(groups))));
    for (const id of ids) {
      const target = randomTarget(r);
      if (target) setTarget(db, id, target);
      for (const m of MONTHS) {
        if (r.chance(0.5)) setAssigned(db, id, m, r.int(-5_000, 30_000));
        const day = String(r.int(1, 28)).padStart(2, "0");
        if (r.chance(0.5)) spend(id, `${m}-${day}` as IsoDate, r.int(-40_000, 5_000));
      }
      if (r.chance(0.15)) {
        archiveCategory(db, id);
        if (r.chance(0.5)) restoreCategory(db, id);
      }
    }
    spend(created(createIncomeCategory(db, "Salary")), "2026-11-25", 300_000);
    return { db, ids };
  }

  it("show a new target or Assigned amount as the server will have it", () => {
    for (const seed of SEEDS) {
      const r = random(seed);
      const { db, ids } = randomBudget(r);
      for (let step = 0; step < 10; step++) {
        const m = r.pick(MONTHS);
        const id = r.pick(ids);
        const before = getBudgetMonth(db, m, NOW);
        let change: BudgetChange;
        if (r.chance(0.5)) {
          const target = randomTarget(r);
          change = { type: "target", categoryId: id, target };
          if (target) setTarget(db, id, target);
          else removeTarget(db, id);
        } else {
          const amount = r.int(-10_000, 60_000);
          change = assign(id, amount);
          setAssigned(db, id, m, amount);
        }
        expect(applyChange(before, change), `seed ${seed}, step ${step}`).toEqual(
          getBudgetMonth(db, m, NOW),
        );
      }
    }
  });

  it("show Assign targets as the server assigns them, and a second time adds nothing", () => {
    for (const seed of SEEDS) {
      const { db } = randomBudget(random(seed));
      for (const m of ["2026-10", NOW, "2026-12", "2027-01", "2027-06", "2027-07"] as Month[]) {
        const before = getBudgetMonth(db, m, NOW);
        const changes = targetChanges(before.groups);
        expect(assignTargets(db, m, NOW, NOW)).toBe(changes.length);
        const after = getBudgetMonth(db, m, NOW);
        expect(changes.reduce(applyChange, before), `seed ${seed}, ${m}`).toEqual(after);
        expect(after.needed).toBe(0);
        expect(assignTargets(db, m, NOW, NOW)).toBe(0);
      }
    }
  });
});
