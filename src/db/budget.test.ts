import { beforeEach, describe, expect, it } from "vitest";
import type { IsoDate, Month } from "../lib/dates";
import { createAccount, getAccounts } from "./accounts";
import * as budget from "./budget";
import {
  archiveCategory,
  deleteGroup,
  getBudgetMonth,
  renameCategory,
  renameGroup,
  setAssigned,
} from "./budget";
import { openDb, type Db } from "./index";
import { transactions } from "./schema";
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
