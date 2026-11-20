import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { IsoDate, Month } from "../lib/dates";
import { createAccount, getAccounts } from "./accounts";
import * as budget from "./budget";
import {
  archiveCategory,
  copyAssignments,
  deleteGroup,
  getArchivedCategories,
  getBudgetMonth,
  moveCategory,
  moveCategoryToGroup,
  moveGroup,
  moveMoney,
  renameCategory,
  renameGroup,
  restoreCategory,
  setAssigned,
} from "./budget";
import { openDb, type Db } from "./index";
import { categories, transactions } from "./schema";
import { created } from "./created";

let db: Db;
let checking: number;
let group: number;

/** Creates a category in the default test group. */
const createCategory = (database: Db, name: string, groupId = group) =>
  created(budget.createCategory(database, name, groupId));

const createGroup = (database: Db, name: string) => created(budget.createGroup(database, name));

/** All category rows of a budget month, across groups. */
const rows = (month: Month) => getBudgetMonth(db, month).groups.flatMap((g) => g.categories);

function spend(categoryId: number | null, date: IsoDate, amount: number, accountId = checking) {
  db.insert(transactions).values({ accountId, categoryId, date, amount }).run();
}

/** money in accounts = ready to assign + all-time balance of every category */
function expectEverythingAccountedFor() {
  const farFuture = getBudgetMonth(db, "2999-12");
  const inAccounts = getAccounts(db).reduce((sum, a) => sum + a.balance, 0);
  expect(farFuture.readyToAssign + farFuture.totals.available).toBe(inAccounts);
  // The two parts Ready to assign is explained with, in any month.
  const month = getBudgetMonth(db, "2026-10");
  expect(month.inAccounts).toBe(inAccounts);
  expect(month.inCategories).toBe(farFuture.totals.available);
}

beforeEach(() => {
  db = openDb(":memory:");
  group = createGroup(db, "Everyday");
  checking = created(
    createAccount(db, {
      name: "Checking",
      type: "checking",
      startingBalance: 100_000,
      balanceDate: "2026-10-01",
    }),
  );
});

describe("ready to assign", () => {
  it("starts as all the money in accounts", () => {
    const month = getBudgetMonth(db, "2026-10");
    expect(month.readyToAssign).toBe(100_000);
    expect(rows("2026-10")).toEqual([]);
    expect(month.hasAccounts).toBe(true);
  });

  it("goes down by what is assigned and back up when it is cleared", () => {
    const groceries = createCategory(db, "Groceries");
    setAssigned(db, groceries, "2026-10", 30_000);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(70_000);

    setAssigned(db, groceries, "2026-10", 25_000);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(75_000);

    setAssigned(db, groceries, "2026-10", 0);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(100_000);
  });

  it("goes up with income and down with spending that has no category", () => {
    spend(null, "2026-10-25", 250_000);
    spend(null, "2026-10-26", -4_000);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(346_000);
  });

  it("is not changed by spending from a category", () => {
    const groceries = createCategory(db, "Groceries");
    setAssigned(db, groceries, "2026-10", 30_000);
    spend(groceries, "2026-10-05", -4_500);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(70_000);
    expectEverythingAccountedFor();
  });

  it("is not changed by a transfer between accounts", () => {
    const savings = created(
      createAccount(db, {
        name: "Savings",
        type: "savings",
        startingBalance: 0,
        balanceDate: "2026-10-01",
      }),
    );
    spend(null, "2026-10-10", -20_000, checking);
    spend(null, "2026-10-10", 20_000, savings);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(100_000);
  });

  it("can go negative when more is assigned than there is", () => {
    const rent = createCategory(db, "Rent");
    setAssigned(db, rent, "2026-10", 120_000);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(-20_000);
  });
});

describe("category balances", () => {
  it("show assigned, activity and available for the month", () => {
    const groceries = createCategory(db, "Groceries");
    setAssigned(db, groceries, "2026-10", 30_000);
    spend(groceries, "2026-10-05", -4_500);
    spend(groceries, "2026-10-31", -5_500);

    const [row] = rows("2026-10");
    expect(row).toEqual({
      id: groceries,
      name: "Groceries",
      assigned: 30_000,
      activity: -10_000,
      available: 20_000,
      balance: 20_000,
    });
  });

  it("roll leftovers over into later months", () => {
    const groceries = createCategory(db, "Groceries");
    setAssigned(db, groceries, "2026-10", 30_000);
    spend(groceries, "2026-10-05", -10_000);
    setAssigned(db, groceries, "2026-11", 30_000);
    spend(groceries, "2026-11-03", -5_000);

    const [november] = rows("2026-11");
    expect(november.assigned).toBe(30_000);
    expect(november.activity).toBe(-5_000);
    expect(november.available).toBe(45_000);

    // An earlier month does not see what happened later.
    expect(rows("2026-10")[0].available).toBe(20_000);
    // A later month with nothing new keeps the balance.
    expect(rows("2026-12")[0]).toMatchObject({
      assigned: 0,
      activity: 0,
      available: 45_000,
    });
  });

  it("tell their balance over all time, which a later month can change", () => {
    const holiday = createCategory(db, "Holiday");
    setAssigned(db, holiday, "2026-10", 30_000);
    setAssigned(db, holiday, "2026-11", 20_000);
    spend(holiday, "2026-12-01", -5_000);

    const [october] = rows("2026-10");
    expect(october.available).toBe(30_000);
    expect(october.balance).toBe(45_000);

    // That balance is what archiving gives back.
    const before = getBudgetMonth(db, "2026-10").readyToAssign;
    archiveCategory(db, holiday);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(before + october.balance);
  });

  it("roll overspending over as a negative balance", () => {
    const fun = createCategory(db, "Fun");
    setAssigned(db, fun, "2026-10", 5_000);
    spend(fun, "2026-10-20", -8_000);
    expect(rows("2026-11")[0].available).toBe(-3_000);
    expectEverythingAccountedFor();
  });

  it("count a refund into the category", () => {
    const clothes = createCategory(db, "Clothes");
    setAssigned(db, clothes, "2026-10", 10_000);
    spend(clothes, "2026-10-02", -6_000);
    spend(clothes, "2026-10-09", 6_000);
    expect(rows("2026-10")[0].available).toBe(10_000);
  });

  it("add up in the totals row", () => {
    const a = createCategory(db, "A");
    const b = createCategory(db, "B");
    setAssigned(db, a, "2026-10", 10_000);
    setAssigned(db, b, "2026-10", 20_000);
    spend(a, "2026-10-02", -1_000);
    expect(getBudgetMonth(db, "2026-10").totals).toEqual({
      assigned: 30_000,
      spent: 1_000,
      available: 29_000,
    });
  });

  it("never show a net refund as negative spending in the totals", () => {
    const clothes = createCategory(db, "Clothes");
    spend(clothes, "2026-10-09", 6_000);
    expect(getBudgetMonth(db, "2026-10").totals.spent).toBe(0);
  });
});

describe("categories", () => {
  it("keep the order they were created in", () => {
    createCategory(db, "Rent");
    createCategory(db, "Groceries");
    createCategory(db, "Fun");
    expect(rows("2026-10").map((e) => e.name)).toEqual(["Rent", "Groceries", "Fun"]);
  });

  it("give their balance back to ready to assign when archived", () => {
    const holiday = createCategory(db, "Holiday");
    setAssigned(db, holiday, "2026-10", 40_000);
    spend(holiday, "2026-10-15", -15_000);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(60_000);

    archiveCategory(db, holiday);
    expect(rows("2026-10")).toEqual([]);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(85_000);
    expectEverythingAccountedFor();
  });

  it("cannot share a name with another visible category", () => {
    const fun = createCategory(db, "Fun");
    expect(budget.createCategory(db, "fun", group)).toBe("name-taken");

    const food = createCategory(db, "Food");
    expect(renameCategory(db, food, "FUN")).toBe(false);
    expect(renameCategory(db, fun, "fun")).toBe(true);
    expect(rows("2026-10").map((c) => c.name)).toEqual(["fun", "Food"]);

    // An archived category frees its name.
    archiveCategory(db, fun);
    expect(renameCategory(db, food, "Fun")).toBe(true);
  });

  it("cannot be created in a group that does not exist", () => {
    expect(budget.createCategory(db, "Lost", 9999)).toBe("no-group");
    expect(rows("2026-10")).toEqual([]);
  });

  it("cannot be assigned to once archived, or when they never existed", () => {
    const fun = createCategory(db, "Fun");
    expect(setAssigned(db, fun, "2026-10", 5_000)).toBe(true);
    archiveCategory(db, fun);
    expect(setAssigned(db, fun, "2026-10", 9_000)).toBe(false);
    expect(setAssigned(db, 9999, "2026-10", 9_000)).toBe(false);
  });
});

describe("groups", () => {
  it("list their categories and add up what was assigned, spent and is held", () => {
    const goals = createGroup(db, "Goals");
    const groceries = createCategory(db, "Groceries");
    const holiday = createCategory(db, "Holiday", goals);
    const car = createCategory(db, "Car", goals);
    setAssigned(db, groceries, "2026-10", 30_000);
    setAssigned(db, holiday, "2026-10", 20_000);
    setAssigned(db, car, "2026-10", 5_000);
    spend(holiday, "2026-10-12", -4_000);

    const { groups } = getBudgetMonth(db, "2026-10");
    expect(
      groups.map((g) => [
        g.name,
        g.categories.map((e) => e.name),
        g.assigned,
        g.activity,
        g.available,
      ]),
    ).toEqual([
      ["Everyday", ["Groceries"], 30_000, 0, 30_000],
      ["Goals", ["Holiday", "Car"], 25_000, -4_000, 21_000],
    ]);
  });

  it("are listed even when empty", () => {
    createGroup(db, "Goals");
    expect(getBudgetMonth(db, "2026-10").groups.map((g) => g.name)).toEqual(["Everyday", "Goals"]);
  });

  it("each get their own colour and keep it when another group is deleted", () => {
    const fixed = createGroup(db, "Fixed costs");
    const goals = createGroup(db, "Goals");
    const slots = () =>
      Object.fromEntries(getBudgetMonth(db, "2026-10").groups.map((g) => [g.name, g.colorSlot]));
    expect(slots()).toEqual({ Everyday: 0, "Fixed costs": 1, Goals: 2 });

    deleteGroup(db, fixed);
    expect(slots()).toEqual({ Everyday: 0, Goals: 2 });

    // The freed colour is reused by the next new group.
    createGroup(db, "Fun");
    expect(slots()).toEqual({ Everyday: 0, Goals: 2, Fun: 1 });
    expect(goals).toBeGreaterThan(0);
  });

  it("get no colour once the palette is used up", () => {
    for (const name of ["B", "C", "D", "E", "F", "G"]) createGroup(db, name);
    const last = getBudgetMonth(db, "2026-10").groups.at(-1);
    expect(last).toMatchObject({ name: "G", colorSlot: null });
  });

  it("archive their categories when deleted, giving the money back and keeping the history", () => {
    const groceries = createCategory(db, "Groceries");
    const fun = createCategory(db, "Fun");
    setAssigned(db, groceries, "2026-10", 30_000);
    setAssigned(db, fun, "2026-11", 5_000);
    spend(groceries, "2026-10-05", -1_000);
    expect(getBudgetMonth(db, "2026-11").readyToAssign).toBe(65_000);

    deleteGroup(db, group);
    expect(getBudgetMonth(db, "2026-10").groups).toEqual([]);
    // All of their balance comes back, including what a later month holds.
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(99_000);
    expect(getAccounts(db)[0].balance).toBe(99_000);
    expectEverythingAccountedFor();

    // Their names are free again, like any archived category's.
    const goals = createGroup(db, "Goals");
    expect(budget.createCategory(db, "Groceries", goals)).not.toBe("name-taken");
  });

  it("can be deleted when empty, and earlier archived categories stay archived", () => {
    const old = createCategory(db, "Old");
    archiveCategory(db, old);
    deleteGroup(db, group);
    expect(getBudgetMonth(db, "2026-10").groups).toEqual([]);
    expectEverythingAccountedFor();
  });

  it("cannot share a name with another group", () => {
    expect(budget.createGroup(db, "everyday")).toBe("name-taken");
    const goals = createGroup(db, "Goals");
    expect(renameGroup(db, goals, "EVERYDAY")).toBe(false);
    expect(renameGroup(db, goals, "goals")).toBe(true);
    expect(getBudgetMonth(db, "2026-10").groups.map((g) => g.name)).toEqual(["Everyday", "goals"]);
  });
});

describe("reordering", () => {
  /** The names in each group, in the order the budget page shows them. */
  const layout = () =>
    Object.fromEntries(
      getBudgetMonth(db, "2026-10").groups.map((g) => [g.name, g.categories.map((c) => c.name)]),
    );

  it("swaps a category with its neighbour in the same group", () => {
    const goals = createGroup(db, "Goals");
    createCategory(db, "Rent");
    const water = createCategory(db, "Water");
    createCategory(db, "Holiday", goals);
    createCategory(db, "Phone");

    expect(moveCategory(db, water, "up")).toBe("moved");
    expect(layout()).toEqual({ Everyday: ["Water", "Rent", "Phone"], Goals: ["Holiday"] });
    expect(moveCategory(db, water, "down")).toBe("moved");
    expect(moveCategory(db, water, "down")).toBe("moved");
    expect(layout()).toEqual({ Everyday: ["Rent", "Phone", "Water"], Goals: ["Holiday"] });
  });

  it("does nothing for the first category going up or the last going down", () => {
    const rent = createCategory(db, "Rent");
    const water = createCategory(db, "Water");
    expect(moveCategory(db, rent, "up")).toBe("at-edge");
    expect(moveCategory(db, water, "down")).toBe("at-edge");
    expect(layout()).toEqual({ Everyday: ["Rent", "Water"] });
  });

  it("skips archived categories, and refuses to move one", () => {
    createCategory(db, "Rent");
    const old = createCategory(db, "Old");
    const water = createCategory(db, "Water");
    archiveCategory(db, old);
    expect(moveCategory(db, water, "up")).toBe("moved");
    expect(layout()).toEqual({ Everyday: ["Water", "Rent"] });
    expect(moveCategory(db, old, "up")).toBe("gone");
    expect(moveCategory(db, 9999, "up")).toBe("gone");
  });

  it("still swaps two categories that share a place", () => {
    const rent = createCategory(db, "Rent");
    createCategory(db, "Water");
    db.update(categories).set({ sortOrder: 0 }).run();
    expect(moveCategory(db, rent, "down")).toBe("moved");
    expect(layout()).toEqual({ Everyday: ["Water", "Rent"] });
  });

  it("swaps a group with its neighbour", () => {
    const goals = createGroup(db, "Goals");
    createGroup(db, "Fixed");
    expect(moveGroup(db, goals, "up")).toBe("moved");
    expect(Object.keys(layout())).toEqual(["Goals", "Everyday", "Fixed"]);
    expect(moveGroup(db, goals, "up")).toBe("at-edge");
    expect(moveGroup(db, goals, "down")).toBe("moved");
    expect(moveGroup(db, goals, "down")).toBe("moved");
    expect(moveGroup(db, goals, "down")).toBe("at-edge");
    expect(Object.keys(layout())).toEqual(["Everyday", "Fixed", "Goals"]);
    expect(moveGroup(db, 9999, "up")).toBe("gone");
  });

  it("keeps a new group or category at the end after reordering", () => {
    const goals = createGroup(db, "Goals");
    const rent = createCategory(db, "Rent");
    createCategory(db, "Water");
    moveGroup(db, goals, "up");
    moveCategory(db, rent, "down");
    createGroup(db, "Fixed");
    createCategory(db, "Phone");
    expect(layout()).toEqual({ Goals: [], Everyday: ["Water", "Rent", "Phone"], Fixed: [] });
  });
});

describe("moving a category to another group", () => {
  it("puts it at the end of that group, with its money and history", () => {
    const goals = createGroup(db, "Goals");
    const holiday = createCategory(db, "Holiday");
    createCategory(db, "Groceries");
    createCategory(db, "Car", goals);
    setAssigned(db, holiday, "2026-10", 30_000);
    spend(holiday, "2026-10-12", -4_000);
    const before = getBudgetMonth(db, "2026-10");

    expect(moveCategoryToGroup(db, holiday, goals)).toBe("moved");
    const after = getBudgetMonth(db, "2026-10");
    expect(after.groups.map((g) => [g.name, g.categories.map((c) => c.name), g.available])).toEqual(
      [
        ["Everyday", ["Groceries"], 0],
        ["Goals", ["Car", "Holiday"], 26_000],
      ],
    );
    expect(after.groups[1].categories[1]).toEqual(before.groups[0].categories[0]);
    expect(after.readyToAssign).toBe(before.readyToAssign);
    expectEverythingAccountedFor();
  });

  it("refuses a category or group that is not there", () => {
    const goals = createGroup(db, "Goals");
    const old = createCategory(db, "Old");
    archiveCategory(db, old);
    expect(moveCategoryToGroup(db, old, goals)).toBe("no-category");
    expect(moveCategoryToGroup(db, 9999, goals)).toBe("no-category");
    const rent = createCategory(db, "Rent");
    expect(moveCategoryToGroup(db, rent, 9999)).toBe("no-group");
    expect(getBudgetMonth(db, "2026-10").groups[0].categories.map((c) => c.name)).toEqual(["Rent"]);
  });
});

describe("moving money", () => {
  let groceries: number;
  let holiday: number;
  beforeEach(() => {
    groceries = createCategory(db, "Groceries");
    holiday = createCategory(db, "Holiday");
    setAssigned(db, groceries, "2026-10", 30_000);
    setAssigned(db, holiday, "2026-10", 10_000);
  });

  /** Assigned in October, per category name. */
  const assigned = () => Object.fromEntries(rows("2026-10").map((c) => [c.name, c.assigned]));
  const ready = () => getBudgetMonth(db, "2026-10").readyToAssign;

  it("between two categories changes their Assigned amounts and leaves Ready to assign", () => {
    const before = ready();
    expect(moveMoney(db, { from: groceries, to: holiday, month: "2026-10", amount: 5_000 })).toBe(
      "moved",
    );
    expect(assigned()).toEqual({ Groceries: 25_000, Holiday: 15_000 });
    expect(ready()).toBe(before);
    expectEverythingAccountedFor();
  });

  it("from Ready to assign puts it in one category", () => {
    moveMoney(db, { from: "ready", to: holiday, month: "2026-10", amount: 7_500 });
    expect(assigned()).toEqual({ Groceries: 30_000, Holiday: 17_500 });
    expect(ready()).toBe(52_500);
    expectEverythingAccountedFor();
  });

  it("to Ready to assign takes it out of one category", () => {
    moveMoney(db, { from: groceries, to: "ready", month: "2026-10", amount: 30_000 });
    expect(assigned()).toEqual({ Groceries: 0, Holiday: 10_000 });
    expect(ready()).toBe(90_000);
    expectEverythingAccountedFor();
  });

  it("covers an overspent category in the month it is viewed in", () => {
    spend(holiday, "2026-11-03", -16_000);
    expect(rows("2026-11")[1].available).toBe(-6_000);
    moveMoney(db, { from: groceries, to: holiday, month: "2026-11", amount: 6_000 });
    expect(rows("2026-11").map((c) => [c.name, c.assigned, c.available])).toEqual([
      ["Groceries", -6_000, 24_000],
      ["Holiday", 6_000, 0],
    ]);
    // October is left as it was.
    expect(assigned()).toEqual({ Groceries: 30_000, Holiday: 10_000 });
    expectEverythingAccountedFor();
  });

  it("refuses amounts that are not above zero, and a move to the same place", () => {
    for (const amount of [0, -5_000, 0.5]) {
      expect(moveMoney(db, { from: groceries, to: holiday, month: "2026-10", amount })).toBe(
        "not-positive",
      );
    }
    expect(moveMoney(db, { from: holiday, to: holiday, month: "2026-10", amount: 1 })).toBe("same");
    expect(moveMoney(db, { from: "ready", to: "ready", month: "2026-10", amount: 1 })).toBe("same");
    expect(assigned()).toEqual({ Groceries: 30_000, Holiday: 10_000 });
  });

  it("refuses archived, income and missing categories, and then changes nothing", () => {
    archiveCategory(db, holiday);
    const salary = createCategory(db, "Salary");
    db.update(categories).set({ income: true }).where(eq(categories.id, salary)).run();
    for (const [from, to] of [
      [groceries, holiday],
      [holiday, "ready"],
      [salary, groceries],
      ["ready", salary],
      [groceries, 9999],
    ] as const) {
      expect(moveMoney(db, { from, to, month: "2026-10", amount: 1_000 })).toBe("no-category");
    }
    expect(rows("2026-10").find((c) => c.name === "Groceries")?.assigned).toBe(30_000);
    expectEverythingAccountedFor();
  });
});

describe("archived categories", () => {
  it("are listed by name with what they hold over all time", () => {
    const water = createCategory(db, "water");
    const fun = createCategory(db, "Fun");
    createCategory(db, "Rent");
    setAssigned(db, water, "2026-10", 5_000);
    setAssigned(db, water, "2026-12", 2_000);
    spend(fun, "2026-10-04", -3_000);
    archiveCategory(db, water);
    archiveCategory(db, fun);
    expect(getArchivedCategories(db)).toEqual([
      { id: fun, name: "Fun", balance: -3_000 },
      { id: water, name: "water", balance: 7_000 },
    ]);
  });

  it("come back at the end of their group, with their history and balance", () => {
    const goals = createGroup(db, "Goals");
    const holiday = createCategory(db, "Holiday", goals);
    createCategory(db, "Car", goals);
    setAssigned(db, holiday, "2026-10", 16_000);
    spend(holiday, "2026-10-20", -1_000);
    archiveCategory(db, holiday);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(99_000);

    expect(restoreCategory(db, holiday)).toBe("restored");
    const month = getBudgetMonth(db, "2026-10");
    expect(month.groups[1].categories.map((c) => [c.name, c.assigned, c.available])).toEqual([
      ["Car", 0, 0],
      ["Holiday", 16_000, 15_000],
    ]);
    // Its balance leaves Ready to assign again.
    expect(month.readyToAssign).toBe(84_000);
    expect(getArchivedCategories(db)).toEqual([]);
    expectEverythingAccountedFor();
  });

  it("come back in the first group when theirs was deleted", () => {
    const goals = createGroup(db, "Goals");
    const holiday = createCategory(db, "Holiday", goals);
    deleteGroup(db, goals);
    expect(restoreCategory(db, holiday)).toBe("restored");
    expect(getBudgetMonth(db, "2026-10").groups.map((g) => [g.name, g.categories.length])).toEqual([
      ["Everyday", 1],
    ]);
  });

  it("are not restored while a visible category has their name, or when there is no group", () => {
    const fun = createCategory(db, "Fun");
    archiveCategory(db, fun);
    const newFun = createCategory(db, "FUN");
    expect(restoreCategory(db, fun)).toBe("name-taken");
    archiveCategory(db, newFun);
    deleteGroup(db, group);
    expect(restoreCategory(db, fun)).toBe("no-group");
    expect(getArchivedCategories(db).map((c) => c.name)).toEqual(["Fun", "FUN"]);
    expect(restoreCategory(db, 9999)).toBe("no-category");
  });

  it("restoring a visible category changes nothing", () => {
    const rent = createCategory(db, "Rent");
    expect(restoreCategory(db, rent)).toBe("restored");
    expect(rows("2026-10").map((c) => c.name)).toEqual(["Rent"]);
  });
});

describe("starting a month from the one before", () => {
  it("is offered once something was assigned to a visible category in the month before", () => {
    const fun = createCategory(db, "Fun");
    expect(getBudgetMonth(db, "2026-11").assignedLastMonth).toBe(false);
    setAssigned(db, fun, "2026-10", 5_000);
    expect(getBudgetMonth(db, "2026-11").assignedLastMonth).toBe(true);
    expect(getBudgetMonth(db, "2026-12").assignedLastMonth).toBe(false);
    archiveCategory(db, fun);
    expect(getBudgetMonth(db, "2026-11").assignedLastMonth).toBe(false);
  });

  it("copies what each visible category got, unless it already has an amount", () => {
    const rent = createCategory(db, "Rent");
    const water = createCategory(db, "Water");
    const fun = createCategory(db, "Fun");
    const old = createCategory(db, "Old");
    createCategory(db, "New");
    setAssigned(db, rent, "2026-10", 50_000);
    setAssigned(db, water, "2026-10", 2_000);
    setAssigned(db, fun, "2026-10", 3_000);
    setAssigned(db, old, "2026-10", 1_000);
    archiveCategory(db, old);
    setAssigned(db, water, "2026-11", 2_500);
    const before = getBudgetMonth(db, "2026-11").readyToAssign;

    expect(copyAssignments(db, "2026-10", "2026-11")).toBe(2);
    expect(rows("2026-11").map((c) => [c.name, c.assigned])).toEqual([
      ["Rent", 50_000],
      ["Water", 2_500],
      ["Fun", 3_000],
      ["New", 0],
    ]);
    expect(getBudgetMonth(db, "2026-11").readyToAssign).toBe(before - 53_000);
    expectEverythingAccountedFor();

    // A second time there is nothing left to fill in.
    expect(copyAssignments(db, "2026-10", "2026-11")).toBe(0);
  });
});
