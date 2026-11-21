import { eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { addMonths, type IsoDate, type Month } from "../lib/dates";
import { readyLines } from "../lib/ready";
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
  setNextMonth,
  setCategoryIcon,
  setGroupColor,
} from "./budget";
import { openDb, type Db } from "./index";
import { assignments, categories, transactions } from "./schema";
import { created } from "./created";

let db: Db;
let checking: number;
let group: number;

/** Creates a category in the default test group. */
const createCategory = (database: Db, name: string, groupId = group) =>
  created(budget.createCategory(database, name, groupId));

const createGroup = (database: Db, name: string) => created(budget.createGroup(database, name));

const createIncomeCategory = (name: string) => created(budget.createIncomeCategory(db, name));

/** All category rows of a budget month, across groups. */
const rows = (month: Month) => getBudgetMonth(db, month).groups.flatMap((g) => g.categories);

function spend(categoryId: number | null, date: IsoDate, amount: number, accountId = checking) {
  db.insert(transactions).values({ accountId, categoryId, date, amount }).run();
}

/**
 * The lines Ready to assign is explained with add up to it in `month`, and
 * say the same as the month's other figures. Returns its parts.
 */
function expectReadyAddsUp(month: Month) {
  const figures = getBudgetMonth(db, month);
  const { readyBreakdown } = figures;
  const lines = readyLines(readyBreakdown);
  expect(
    lines.reduce((sum, line) => sum + line.amount, 0),
    `the lines for ${month}`,
  ).toBe(figures.readyToAssign);
  expect(readyBreakdown.received).toBe(figures.income.received);
  expect(readyBreakdown.assigned).toBe(figures.totals.assigned);
  return readyBreakdown;
}

/** Every month from a year before October 2026 to a year after it, and two far away. */
const MONTHS = [
  "1999-12",
  ...Array.from({ length: 25 }, (_, i) => addMonths("2025-10", i)),
  "2999-12",
] as Month[];

/** money in accounts = ready to assign + all-time balance of every category */
function expectEverythingAccountedFor() {
  const farFuture = getBudgetMonth(db, "2999-12");
  const inAccounts = getAccounts(db).reduce((sum, a) => sum + a.balance, 0);
  expect(farFuture.readyToAssign + farFuture.totals.available).toBe(inAccounts);
  // Ready to assign is the same in every month, and explained in every month.
  for (const month of MONTHS) expectReadyAddsUp(month);
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

describe("how Ready to assign adds up", () => {
  const nothing = {
    leftOver: 0,
    received: 0,
    withoutCategory: 0,
    assigned: 0,
    assignedLater: 0,
    alreadyIn: 0,
    beyondNextMonth: false,
  };

  it("is all zero without accounts, and then shows only the lines that are always there", () => {
    db = openDb(":memory:");
    for (const month of MONTHS) expect(expectReadyAddsUp(month)).toEqual(nothing);
    expect(readyLines(getBudgetMonth(db, "2026-11").readyBreakdown)).toEqual([
      { part: "leftOver", amount: 0 },
      { part: "received", amount: 0 },
      { part: "assigned", amount: 0 },
    ]);
  });

  it("with income only, is what came in: received in its month, left over after it", () => {
    db = openDb(":memory:");
    checking = created(
      createAccount(db, {
        name: "Checking",
        type: "checking",
        startingBalance: 0,
        balanceDate: "2026-10-01",
      }),
    );
    const salary = createIncomeCategory("Salary");
    spend(salary, "2026-10-25", 285_000);
    expect(expectReadyAddsUp("2026-09")).toEqual({ ...nothing, alreadyIn: 285_000 });
    expect(expectReadyAddsUp("2026-10")).toEqual({ ...nothing, received: 285_000 });
    expect(expectReadyAddsUp("2026-11")).toEqual({ ...nothing, leftOver: 285_000 });
    expectEverythingAccountedFor();
  });

  it("counts a starting balance for the month of its date, without a category", () => {
    expect(expectReadyAddsUp("2026-10")).toEqual({ ...nothing, withoutCategory: 100_000 });
    expect(expectReadyAddsUp("2026-11")).toEqual({ ...nothing, leftOver: 100_000 });
    // Before it: in already, for the next month or a later one.
    expect(expectReadyAddsUp("2026-09")).toEqual({ ...nothing, alreadyIn: 100_000 });
    expect(expectReadyAddsUp("2026-08")).toEqual({
      ...nothing,
      alreadyIn: 100_000,
      beyondNextMonth: true,
    });
    expectEverythingAccountedFor();
  });

  it("counts income that counts for the next month there, and as in already before that", () => {
    const salary = createIncomeCategory("Salary");
    setNextMonth(db, salary, true);
    spend(salary, "2026-10-25", 285_000);
    spend(salary, "2026-11-01", 290_000);
    // In October, both salaries are in already: one for November, one for December.
    expect(expectReadyAddsUp("2026-10")).toEqual({
      ...nothing,
      withoutCategory: 100_000,
      alreadyIn: 575_000,
      beyondNextMonth: true,
    });
    expect(expectReadyAddsUp("2026-11")).toEqual({
      ...nothing,
      leftOver: 100_000,
      received: 285_000,
      alreadyIn: 290_000,
    });
    expect(expectReadyAddsUp("2026-12")).toEqual({
      ...nothing,
      leftOver: 385_000,
      received: 290_000,
    });
    expectEverythingAccountedFor();
  });

  it("counts transactions to sort and without a category for the month of their date", () => {
    db.insert(transactions)
      .values([
        { accountId: checking, date: "2026-11-03", amount: -2_340, payee: "Shop", toSort: true },
        { accountId: checking, date: "2026-11-04", amount: 12_000, payee: "Friend", toSort: true },
        { accountId: checking, date: "2026-11-05", amount: -5_000 },
      ])
      .run();
    expect(expectReadyAddsUp("2026-11")).toEqual({
      ...nothing,
      leftOver: 100_000,
      withoutCategory: -2_340 + 12_000 - 5_000,
    });
    expectEverythingAccountedFor();
  });

  it("counts an archived category's transactions without a category, and leaves out what it was assigned", () => {
    const groceries = createCategory(db, "Groceries");
    setAssigned(db, groceries, "2026-10", 30_000);
    setAssigned(db, groceries, "2026-11", 20_000);
    spend(groceries, "2026-10-05", -4_500);
    spend(groceries, "2026-11-05", -6_000);
    expect(expectReadyAddsUp("2026-11")).toEqual({
      ...nothing,
      leftOver: 100_000 - 30_000,
      assigned: 20_000,
    });

    archiveCategory(db, groceries);
    expect(expectReadyAddsUp("2026-11")).toEqual({
      ...nothing,
      leftOver: 100_000 - 4_500,
      withoutCategory: -6_000,
    });
    expectEverythingAccountedFor();
  });

  it("counts an archived income category's money without a category, in the month it came in", () => {
    const salary = createIncomeCategory("Salary");
    setNextMonth(db, salary, true);
    spend(salary, "2026-10-25", 285_000);
    expect(expectReadyAddsUp("2026-10")).toEqual({
      ...nothing,
      withoutCategory: 100_000,
      alreadyIn: 285_000,
    });

    archiveCategory(db, salary);
    expect(expectReadyAddsUp("2026-10")).toEqual({ ...nothing, withoutCategory: 385_000 });
    expect(expectReadyAddsUp("2026-11")).toEqual({ ...nothing, leftOver: 385_000 });
    expectEverythingAccountedFor();

    restoreCategory(db, salary);
    expect(expectReadyAddsUp("2026-11")).toEqual({
      ...nothing,
      leftOver: 100_000,
      received: 285_000,
    });
  });

  it("takes away what is assigned in earlier months, in the month and in later months", () => {
    const rent = createCategory(db, "Rent");
    const holiday = createCategory(db, "Holiday");
    setAssigned(db, rent, "2026-09", 10_000);
    setAssigned(db, rent, "2026-10", 30_000);
    setAssigned(db, holiday, "2026-10", 5_000);
    setAssigned(db, rent, "2026-11", 35_000);
    setAssigned(db, holiday, "2026-12", 40_000);
    // Money taken back out of a category in a later month gives it back.
    setAssigned(db, holiday, "2027-01", -2_000);

    expect(expectReadyAddsUp("2026-10")).toEqual({
      ...nothing,
      leftOver: -10_000,
      withoutCategory: 100_000,
      assigned: 35_000,
      assignedLater: 35_000 + 40_000 - 2_000,
    });
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(100_000 - 118_000);
    expectEverythingAccountedFor();
  });

  it("leaves overspending out: it stays in its category", () => {
    const groceries = createCategory(db, "Groceries");
    setAssigned(db, groceries, "2026-10", 10_000);
    spend(groceries, "2026-10-12", -30_000);
    expect(expectReadyAddsUp("2026-10")).toEqual({
      ...nothing,
      withoutCategory: 100_000,
      assigned: 10_000,
    });
    expect(expectReadyAddsUp("2026-11")).toEqual({ ...nothing, leftOver: 90_000 });
    expectEverythingAccountedFor();
  });

  it("crosses the turn of the year", () => {
    const salary = createIncomeCategory("Salary");
    const rent = createCategory(db, "Rent");
    setNextMonth(db, salary, true);
    spend(salary, "2026-12-24", 285_000);
    setAssigned(db, rent, "2026-12", 100_000);
    setAssigned(db, rent, "2027-01", 110_000);

    expect(expectReadyAddsUp("2026-12")).toEqual({
      ...nothing,
      leftOver: 100_000,
      assigned: 100_000,
      assignedLater: 110_000,
      alreadyIn: 285_000,
    });
    expect(expectReadyAddsUp("2027-01")).toEqual({
      ...nothing,
      received: 285_000,
      assigned: 110_000,
    });
    expect(expectReadyAddsUp("2026-11")).toMatchObject({
      alreadyIn: 285_000,
      beyondNextMonth: true,
    });
    expectEverythingAccountedFor();
  });

  it("adds up in a month before everything, among it and after it", () => {
    const savings = created(
      createAccount(db, {
        name: "Savings",
        type: "savings",
        startingBalance: 500_000,
        balanceDate: "2026-10-01",
      }),
    );
    const salary = createIncomeCategory("Salary");
    const bonus = createIncomeCategory("Bonus");
    const groceries = createCategory(db, "Groceries");
    const old = createCategory(db, "Old");
    setNextMonth(db, salary, true);
    spend(salary, "2026-09-25", 280_000);
    spend(salary, "2026-10-24", 285_000);
    spend(bonus, "2026-11-15", 50_000);
    spend(groceries, "2026-10-03", -6_000);
    spend(old, "2026-09-03", -1_000);
    spend(null, "2026-11-20", -4_200);
    // A transfer between the accounts, and money dated ahead.
    spend(null, "2026-12-05", -20_000, checking);
    spend(null, "2026-12-05", 20_000, savings);
    spend(null, "2027-01-10", 3_000);
    setAssigned(db, groceries, "2026-09", 20_000);
    setAssigned(db, groceries, "2026-10", 25_000);
    setAssigned(db, groceries, "2026-11", 30_000);
    setAssigned(db, groceries, "2027-02", 10_000);
    setAssigned(db, old, "2026-09", 5_000);
    archiveCategory(db, old);

    const money = 600_000 + 280_000 + 285_000 + 50_000 - 1_000 - 4_200 + 3_000;
    const assigned = 20_000 + 25_000 + 30_000 + 10_000;
    expect(getBudgetMonth(db, "2026-11").readyToAssign).toBe(money - assigned);

    expect(expectReadyAddsUp("1999-12")).toEqual({
      ...nothing,
      assignedLater: assigned,
      alreadyIn: money,
      beyondNextMonth: true,
    });
    expect(expectReadyAddsUp("2026-11")).toEqual({
      leftOver: 600_000 + 280_000 - 1_000 - 45_000,
      received: 285_000 + 50_000,
      withoutCategory: -4_200,
      assigned: 30_000,
      assignedLater: 10_000,
      alreadyIn: 3_000,
      beyondNextMonth: true,
    });
    expect(expectReadyAddsUp("2999-12")).toEqual({ ...nothing, leftOver: money - assigned });
    expectEverythingAccountedFor();
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

  it("can be given another colour of the palette, also by a grey one", () => {
    for (const name of ["B", "C", "D", "E", "F", "G"]) createGroup(db, name);
    const slots = () => getBudgetMonth(db, "2026-10").groups.map((g) => g.colorSlot);
    expect(slots()).toEqual([0, 1, 2, 3, 4, 5, null]);

    expect(setGroupColor(db, group, 3)).toBe(true);
    const grey = getBudgetMonth(db, "2026-10").groups.at(-1)!.id!;
    expect(setGroupColor(db, grey, 3)).toBe(true);
    expect(slots()).toEqual([3, 1, 2, 3, 4, 5, 3]);
  });

  it("refuse a colour outside the palette, or a group that is not there", () => {
    for (const slot of [-1, 6, 1.5, Number.NaN]) expect(setGroupColor(db, group, slot)).toBe(false);
    expect(setGroupColor(db, 9999, 2)).toBe(false);
    expect(getBudgetMonth(db, "2026-10").groups[0].colorSlot).toBe(0);
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

  it("refuses a category or group that is not there, and an income category", () => {
    const goals = createGroup(db, "Goals");
    const old = createCategory(db, "Old");
    archiveCategory(db, old);
    expect(moveCategoryToGroup(db, old, goals)).toBe("no-category");
    expect(moveCategoryToGroup(db, 9999, goals)).toBe("no-category");
    const salary = createIncomeCategory("Salary");
    expect(moveCategoryToGroup(db, salary, goals)).toBe("no-category");
    expect(getBudgetMonth(db, "2026-10").income.categories.map((c) => c.name)).toEqual(["Salary"]);
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

  /** Moves money the way the form does: from the Assigned amounts on screen at that moment. */
  function move(input: {
    from: budget.MoneyEnd;
    to: budget.MoneyEnd;
    month: Month;
    amount: number;
  }) {
    const shown = (end: budget.MoneyEnd) =>
      rows(input.month).find((c) => c.id === end)?.assigned ?? null;
    return moveMoney(db, { ...input, seen: { from: shown(input.from), to: shown(input.to) } });
  }

  it("between two categories changes their Assigned amounts and leaves Ready to assign", () => {
    const before = ready();
    expect(move({ from: groceries, to: holiday, month: "2026-10", amount: 5_000 })).toBe("moved");
    expect(assigned()).toEqual({ Groceries: 25_000, Holiday: 15_000 });
    expect(ready()).toBe(before);
    expectEverythingAccountedFor();
  });

  it("from Ready to assign puts it in one category", () => {
    move({ from: "ready", to: holiday, month: "2026-10", amount: 7_500 });
    expect(assigned()).toEqual({ Groceries: 30_000, Holiday: 17_500 });
    expect(ready()).toBe(52_500);
    expectEverythingAccountedFor();
  });

  it("to Ready to assign takes it out of one category", () => {
    move({ from: groceries, to: "ready", month: "2026-10", amount: 30_000 });
    expect(assigned()).toEqual({ Groceries: 0, Holiday: 10_000 });
    expect(ready()).toBe(90_000);
    expectEverythingAccountedFor();
  });

  it("covers an overspent category in the month it is viewed in", () => {
    spend(holiday, "2026-11-03", -16_000);
    expect(rows("2026-11")[1].available).toBe(-6_000);
    move({ from: groceries, to: holiday, month: "2026-11", amount: 6_000 });
    expect(rows("2026-11").map((c) => [c.name, c.assigned, c.available])).toEqual([
      ["Groceries", -6_000, 24_000],
      ["Holiday", 6_000, 0],
    ]);
    // October is left as it was.
    expect(assigned()).toEqual({ Groceries: 30_000, Holiday: 10_000 });
    expectEverythingAccountedFor();
  });

  it("moves the money once when the same move is asked for twice", () => {
    // What the form showed, sent again because the first answer never came back.
    const sameRequest = {
      from: groceries,
      to: holiday,
      month: "2026-10",
      amount: 5_000,
      seen: { from: 30_000, to: 10_000 },
    } as const;
    expect(moveMoney(db, sameRequest)).toBe("moved");
    expect(moveMoney(db, sameRequest)).toBe("moved");
    expect(assigned()).toEqual({ Groceries: 25_000, Holiday: 15_000 });

    // With Ready to assign at one end, too.
    const fromReady = {
      from: "ready",
      to: holiday,
      month: "2026-10",
      amount: 1_000,
      seen: { from: null, to: 15_000 },
    } as const;
    expect(moveMoney(db, fromReady)).toBe("moved");
    expect(moveMoney(db, fromReady)).toBe("moved");
    expect(assigned()).toEqual({ Groceries: 25_000, Holiday: 16_000 });
    expectEverythingAccountedFor();
  });

  it("moves nothing when the amounts changed since they were looked at", () => {
    setAssigned(db, groceries, "2026-10", 28_000);
    expect(
      moveMoney(db, {
        from: groceries,
        to: holiday,
        month: "2026-10",
        amount: 5_000,
        seen: { from: 30_000, to: 10_000 },
      }),
    ).toBe("changed");
    expect(assigned()).toEqual({ Groceries: 28_000, Holiday: 10_000 });
  });

  it("refuses amounts that are not above zero, and a move to the same place", () => {
    for (const amount of [0, -5_000, 0.5]) {
      expect(move({ from: groceries, to: holiday, month: "2026-10", amount })).toBe("not-positive");
    }
    expect(move({ from: holiday, to: holiday, month: "2026-10", amount: 1 })).toBe("same");
    expect(move({ from: "ready", to: "ready", month: "2026-10", amount: 1 })).toBe("same");
    expect(assigned()).toEqual({ Groceries: 30_000, Holiday: 10_000 });
  });

  it("refuses archived, income and missing categories, and then changes nothing", () => {
    archiveCategory(db, holiday);
    const salary = createIncomeCategory("Salary");
    for (const [from, to] of [
      [groceries, holiday],
      [holiday, "ready"],
      [salary, groceries],
      ["ready", salary],
      [groceries, 9999],
    ] as const) {
      expect(move({ from, to, month: "2026-10", amount: 1_000 })).toBe("no-category");
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
      { id: fun, name: "Fun", balance: -3_000, income: false },
      { id: water, name: "water", balance: 7_000, income: false },
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
    const salary = createIncomeCategory("Salary");
    expect(restoreCategory(db, salary)).toBe("restored");
    expect(getBudgetMonth(db, "2026-10").income.categories.map((c) => c.name)).toEqual(["Salary"]);
    const rent = createCategory(db, "Rent");
    expect(restoreCategory(db, rent)).toBe("restored");
    expect(rows("2026-10").map((c) => c.name)).toEqual(["Rent"]);
  });
});

describe("starting a month from the one before", () => {
  it("is offered once something was assigned to a visible expense category in the month before", () => {
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

  it("does not repeat money that was moved out of a category", () => {
    const rent = createCategory(db, "Rent");
    const repairs = createCategory(db, "Repairs");
    setAssigned(db, rent, "2026-09", 50_000);
    // October: nothing assigned to Rent, and 200.00 of what it holds moved to Repairs.
    expect(
      moveMoney(db, {
        from: rent,
        to: repairs,
        month: "2026-10",
        amount: 20_000,
        seen: { from: 0, to: 0 },
      }),
    ).toBe("moved");
    expect(rows("2026-10").map((c) => [c.name, c.assigned])).toEqual([
      ["Rent", -20_000],
      ["Repairs", 20_000],
    ]);

    // November starts with what was given, not with what was taken away.
    expect(copyAssignments(db, "2026-10", "2026-11")).toBe(1);
    expect(rows("2026-11").map((c) => [c.name, c.assigned])).toEqual([
      ["Rent", 0],
      ["Repairs", 20_000],
    ]);
    expectEverythingAccountedFor();
  });
});

describe("income categories", () => {
  let salary: number;
  let groceries: number;
  beforeEach(() => {
    salary = createIncomeCategory("Salary");
    groceries = createCategory(db, "Groceries");
  });

  const income = (month: Month) => getBudgetMonth(db, month).income;

  it("have no group and are listed apart from the groups", () => {
    const benefits = createIncomeCategory("Benefits");
    const { groups, income } = getBudgetMonth(db, "2026-10");
    expect(groups.map((g) => [g.name, g.categories.map((c) => c.name)])).toEqual([
      ["Everyday", ["Groceries"]],
    ]);
    expect(income).toEqual({
      categories: [
        { id: salary, name: "Salary", received: 0, nextMonth: false },
        { id: benefits, name: "Benefits", received: 0, nextMonth: false },
      ],
      received: 0,
    });
    const stored = db.select().from(categories).where(eq(categories.id, salary)).get();
    expect(stored).toMatchObject({ groupId: null, income: true, archived: false });
  });

  it("hold no money: what comes in through them goes to Ready to assign", () => {
    setAssigned(db, groceries, "2026-10", 30_000);
    spend(salary, "2026-10-25", 285_000);
    spend(groceries, "2026-10-26", -4_500);

    const month = getBudgetMonth(db, "2026-10");
    expect(month.readyToAssign).toBe(100_000 + 285_000 - 30_000);
    expect(month.totals).toEqual({ assigned: 30_000, spent: 4_500, available: 25_500 });
    // Received, with the starting balance beside it; Groceries' spending is not in it.
    expect(month.readyBreakdown).toMatchObject({
      leftOver: 0,
      received: 285_000,
      withoutCategory: 100_000,
      assigned: 30_000,
    });
    expectEverythingAccountedFor();
  });

  it("give the same Ready to assign as no category, in every month", () => {
    setAssigned(db, groceries, "2026-10", 30_000);
    spend(null, "2026-10-25", 285_000);
    spend(null, "2026-11-25", -2_000);
    spend(groceries, "2026-11-02", -4_500);
    const months = ["2026-09", "2026-10", "2026-11", "2999-12"] as const;
    const figures = () =>
      months.map((month) => {
        const { readyToAssign, readyBreakdown, totals, groups } = getBudgetMonth(db, month);
        // Only whether the money shows as received or as without a category differs.
        const { received, withoutCategory, ...parts } = readyBreakdown;
        return { readyToAssign, parts, moneyFor: received + withoutCategory, totals, groups };
      });
    const withoutCategory = figures();

    // The same money sorted into Salary instead: a salary, and a correction of it.
    db.update(transactions)
      .set({ categoryId: salary })
      .where(isNull(transactions.categoryId))
      .run();
    expect(figures()).toEqual(withoutCategory);
    expectEverythingAccountedFor();
  });

  it("say what came in through each of them in the viewed month, and in total", () => {
    const benefits = createIncomeCategory("Benefits");
    spend(salary, "2026-09-30", 270_000);
    spend(salary, "2026-10-01", 285_000);
    // A correction by the employer is netted out.
    spend(salary, "2026-10-15", -5_000);
    spend(benefits, "2026-10-31", 12_000);
    spend(salary, "2026-11-01", 285_000);
    // Money in without a category, or in an expense category, is not income.
    spend(null, "2026-10-20", 40_000);
    spend(groceries, "2026-10-21", 3_000);

    expect(income("2026-10")).toEqual({
      categories: [
        { id: salary, name: "Salary", received: 280_000, nextMonth: false },
        { id: benefits, name: "Benefits", received: 12_000, nextMonth: false },
      ],
      received: 292_000,
    });
    expect(income("2026-09").received).toBe(270_000);
    expect(income("2026-12")).toMatchObject({
      categories: [{ received: 0 }, { received: 0 }],
      received: 0,
    });
    expectEverythingAccountedFor();
  });

  it("cannot be assigned to, and are skipped when copying a month", () => {
    expect(setAssigned(db, salary, "2026-10", 5_000)).toBe(false);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(100_000);

    // Even an amount put there by hand in the database counts nowhere.
    db.insert(assignments).values({ categoryId: salary, month: "2026-10", amount: 5_000 }).run();
    const november = getBudgetMonth(db, "2026-11");
    expect(november.readyToAssign).toBe(100_000);
    expect(november.assignedLastMonth).toBe(false);
    expect(copyAssignments(db, "2026-10", "2026-11")).toBe(0);
    expectEverythingAccountedFor();
  });

  it("stay out of the section for categories without a group", () => {
    const loose = createCategory(db, "Loose");
    db.update(categories).set({ groupId: null }).where(eq(categories.id, loose)).run();
    const { groups, income } = getBudgetMonth(db, "2026-10");
    expect(groups.map((g) => [g.name, g.categories.map((c) => c.name)])).toEqual([
      ["Everyday", ["Groceries"]],
      [budget.UNGROUPED, ["Loose"]],
    ]);
    expect(income.categories.map((c) => c.name)).toEqual(["Salary"]);
  });

  it("share one set of names with the expense categories", () => {
    expect(budget.createIncomeCategory(db, "groceries")).toBe("name-taken");
    expect(budget.createCategory(db, "SALARY", group)).toBe("name-taken");
    expect(renameCategory(db, groceries, "Salary")).toBe(false);
    expect(renameCategory(db, salary, "Groceries")).toBe(false);
    expect(renameCategory(db, salary, "Wages")).toBe(true);
    expect(income("2026-10").categories.map((c) => c.name)).toEqual(["Wages"]);
  });

  it("move up and down among themselves only", () => {
    const benefits = createIncomeCategory("Benefits");
    const interest = createIncomeCategory("Interest");
    createCategory(db, "Rent");
    const names = () => income("2026-10").categories.map((c) => c.name);

    expect(moveCategory(db, interest, "up")).toBe("moved");
    expect(names()).toEqual(["Salary", "Interest", "Benefits"]);
    expect(moveCategory(db, salary, "up")).toBe("at-edge");
    expect(moveCategory(db, benefits, "down")).toBe("at-edge");
    expect(moveCategory(db, salary, "down")).toBe("moved");
    expect(names()).toEqual(["Interest", "Salary", "Benefits"]);
    expect(rows("2026-10").map((c) => c.name)).toEqual(["Groceries", "Rent"]);
  });

  it("change no figure when archived or restored, and come back as income", () => {
    spend(salary, "2026-10-01", 285_000);
    setAssigned(db, groceries, "2026-10", 30_000);
    const before = getBudgetMonth(db, "2026-10");

    archiveCategory(db, salary);
    const archived = getBudgetMonth(db, "2026-10");
    expect(archived.income).toEqual({ categories: [], received: 0 });
    expect(archived.readyToAssign).toBe(before.readyToAssign);
    // Nothing to give back or take out again.
    expect(getArchivedCategories(db)).toEqual([
      { id: salary, name: "Salary", balance: 0, income: true },
    ]);
    expectEverythingAccountedFor();

    // Without any group left, it still comes back: it needs none.
    deleteGroup(db, group);
    createIncomeCategory("Benefits");
    expect(restoreCategory(db, salary)).toBe("restored");
    const restored = getBudgetMonth(db, "2026-10");
    expect(restored.income.categories.map((c) => [c.name, c.received])).toEqual([
      ["Benefits", 0],
      ["Salary", 285_000],
    ]);
    expect(restored.groups).toEqual([]);
    expect(db.select().from(categories).where(eq(categories.id, salary)).get()).toMatchObject({
      groupId: null,
      income: true,
    });
    expectEverythingAccountedFor();
  });

  it("are not restored while a visible category has their name", () => {
    archiveCategory(db, salary);
    createCategory(db, "salary");
    expect(restoreCategory(db, salary)).toBe("name-taken");
    expect(income("2026-10").categories).toEqual([]);
  });
});

describe("income that counts for the next month", () => {
  let salary: number;
  let benefits: number;
  let groceries: number;
  beforeEach(() => {
    salary = createIncomeCategory("Salary");
    benefits = createIncomeCategory("Benefits");
    groceries = createCategory(db, "Groceries");
  });

  /** What Salary, Benefits and all income received for a month. */
  const receivedIn = (month: Month) => {
    const { income } = getBudgetMonth(db, month);
    return [...income.categories.map((c) => c.received), income.received];
  };

  /** Every figure of a month but the income section and how Ready to assign adds up. */
  const otherFigures = (month: Month) => ({
    ...getBudgetMonth(db, month),
    income: undefined,
    readyBreakdown: undefined,
  });

  it("is off for a new income category", () => {
    expect(getBudgetMonth(db, "2026-10").income.categories.map((c) => c.nextMonth)).toEqual([
      false,
      false,
    ]);
    expect(db.select().from(categories).where(eq(categories.id, salary)).get()).toMatchObject({
      nextMonth: false,
    });
  });

  it("counts everything that comes in during a month for the next month", () => {
    spend(salary, "2026-09-25", 270_000);
    spend(salary, "2026-10-05", 15_000);
    spend(salary, "2026-10-14", 1_000);
    spend(salary, "2026-10-15", 200);
    spend(salary, "2026-10-25", 285_000);
    // A salary paid at the start of the month counts for the next one too.
    spend(salary, "2026-11-01", 290_000);
    spend(salary, "2026-11-14", 300);
    spend(salary, "2026-11-15", 295_000);
    // Benefits keeps counting for the month the money arrived in.
    spend(benefits, "2026-10-25", 12_000);

    // Off: each month what arrived in it.
    expect(receivedIn("2026-10")).toEqual([301_200, 12_000, 313_200]);
    expect(receivedIn("2026-11")).toEqual([585_300, 0, 585_300]);

    expect(setNextMonth(db, salary, true)).toBe(true);
    expect(getBudgetMonth(db, "2026-10").income.categories.map((c) => c.nextMonth)).toEqual([
      true,
      false,
    ]);
    // Each month shows what came in the month before.
    expect(receivedIn("2026-10")).toEqual([270_000, 12_000, 282_000]);
    expect(receivedIn("2026-11")).toEqual([301_200, 0, 301_200]);
    expect(receivedIn("2026-12")).toEqual([585_300, 0, 585_300]);
    expect(receivedIn("2026-09")).toEqual([0, 0, 0]);
    expectEverythingAccountedFor();
  });

  it("crosses the turn of the year", () => {
    setNextMonth(db, salary, true);
    spend(salary, "2026-12-14", 1_000);
    spend(salary, "2026-12-15", 285_000);
    spend(salary, "2027-01-14", 2_000);
    spend(salary, "2027-01-15", 290_000);
    expect(receivedIn("2026-12")).toEqual([0, 0, 0]);
    expect(receivedIn("2027-01")).toEqual([286_000, 0, 286_000]);
    expect(receivedIn("2027-02")).toEqual([292_000, 0, 292_000]);
  });

  it("changes no figure but the received ones, in any month", () => {
    setAssigned(db, groceries, "2026-10", 30_000);
    setAssigned(db, groceries, "2026-11", 35_000);
    spend(salary, "2026-10-25", 285_000);
    spend(groceries, "2026-10-26", -4_500);
    spend(null, "2026-11-02", 10_000);
    const months = ["2026-09", "2026-10", "2026-11", "2026-12", "2999-12"] as const;
    const before = months.map(otherFigures);

    setNextMonth(db, salary, true);
    expect(months.map(otherFigures)).toEqual(before);
    expect(getBudgetMonth(db, "2026-10").readyToAssign).toBe(100_000 + 285_000 + 10_000 - 65_000);
    // Only the sum that explains it moves the salary, from October to November.
    expect(expectReadyAddsUp("2026-10")).toEqual({
      leftOver: 0,
      received: 0,
      withoutCategory: 100_000,
      assigned: 30_000,
      assignedLater: 35_000,
      alreadyIn: 285_000 + 10_000,
      beyondNextMonth: false,
    });
    expect(expectReadyAddsUp("2026-11")).toEqual({
      leftOver: 100_000 - 30_000,
      received: 285_000,
      withoutCategory: 10_000,
      assigned: 35_000,
      assignedLater: 0,
      alreadyIn: 0,
      beyondNextMonth: false,
    });
    expectEverythingAccountedFor();
  });

  it("puts everything back when switched off", () => {
    spend(salary, "2026-10-25", 285_000);
    spend(salary, "2026-11-05", 15_000);
    const months = ["2026-10", "2026-11", "2026-12"] as const;
    const off = months.map(receivedIn);

    setNextMonth(db, salary, true);
    // October's salary shows in November, November's in December.
    expect(months.map(receivedIn)).toEqual([
      [0, 0, 0],
      [285_000, 0, 285_000],
      [15_000, 0, 15_000],
    ]);
    expect(setNextMonth(db, salary, false)).toBe(true);
    expect(months.map(receivedIn)).toEqual(off);
    expect(getBudgetMonth(db, "2026-10").income.categories[0].nextMonth).toBe(false);
  });

  it("is kept when the category is archived and restored", () => {
    setNextMonth(db, salary, true);
    archiveCategory(db, salary);
    expect(restoreCategory(db, salary)).toBe("restored");
    const restored = getBudgetMonth(db, "2026-10").income.categories.find((c) => c.id === salary);
    expect(restored?.nextMonth).toBe(true);
  });

  it("is refused for an expense, archived or missing category, and then changes nothing", () => {
    spend(groceries, "2026-10-25", -4_500);
    const before = getBudgetMonth(db, "2026-11");
    expect(setNextMonth(db, groceries, true)).toBe(false);
    expect(setNextMonth(db, 999, true)).toBe(false);
    archiveCategory(db, benefits);
    expect(setNextMonth(db, benefits, true)).toBe(false);
    expect(
      db
        .select({ nextMonth: categories.nextMonth })
        .from(categories)
        .all()
        .map((c) => c.nextMonth),
    ).toEqual([false, false, false]);
    restoreCategory(db, benefits);
    expect(getBudgetMonth(db, "2026-11")).toEqual(before);
  });
});

describe("category icons", () => {
  const icons = () => {
    const { groups, income } = getBudgetMonth(db, "2026-10");
    return [...groups.flatMap((g) => g.categories), ...income.categories].map((c) => [
      c.name,
      c.icon,
    ]);
  };

  it("start as the envelope, and keep the icon chosen until the envelope is chosen again", () => {
    const rent = createCategory(db, "Rent");
    const salary = createIncomeCategory("Salary");
    expect(icons()).toEqual([
      ["Rent", undefined],
      ["Salary", undefined],
    ]);

    expect(setCategoryIcon(db, rent, "house")).toBe(true);
    expect(setCategoryIcon(db, salary, "briefcase")).toBe(true);
    expect(icons()).toEqual([
      ["Rent", "house"],
      ["Salary", "briefcase"],
    ]);

    expect(setCategoryIcon(db, rent, null)).toBe(true);
    expect(icons()).toEqual([
      ["Rent", undefined],
      ["Salary", "briefcase"],
    ]);
    expect(db.select().from(categories).where(eq(categories.id, rent)).get()?.icon).toBeNull();
  });

  it("stay with a category that is moved, renamed, archived and restored", () => {
    const rent = createCategory(db, "Rent");
    const home = createGroup(db, "Home");
    setCategoryIcon(db, rent, "house");
    moveCategoryToGroup(db, rent, home);
    renameCategory(db, rent, "Housing");
    archiveCategory(db, rent);
    restoreCategory(db, rent);
    expect(icons()).toEqual([["Housing", "house"]]);
  });

  it("are refused for an archived category or one that is not there, and then nothing changes", () => {
    const rent = createCategory(db, "Rent");
    archiveCategory(db, rent);
    expect(setCategoryIcon(db, rent, "house")).toBe(false);
    expect(setCategoryIcon(db, 999, "house")).toBe(false);
    expect(db.select().from(categories).where(eq(categories.id, rent)).get()?.icon).toBeNull();
  });

  it("show the envelope for an icon that is not in the set, as in a hand-edited database", () => {
    const rent = createCategory(db, "Rent");
    db.update(categories).set({ icon: "rocket" }).where(eq(categories.id, rent)).run();
    expect(icons()).toEqual([["Rent", undefined]]);
  });
});
