import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { IsoDate } from "../lib/dates";
import * as budget from "./budget";
import { archiveCategory, createAccount, getAccounts, getBudgetMonth, setAssigned } from "./budget";
import { openDb, type Db } from "./index";
import { created } from "./created";
import { deletedImports, transactions } from "./schema";
import {
  countTransactions,
  deleteTransaction,
  findKnownRows,
  getCategoryOptions,
  getFilterOptions,
  getImportAccounts,
  importTransactions,
  listTransactions,
  saveImportMapping,
  sortTransaction,
  suggestCategories,
  summarizeTransactions,
  undoImport,
  type ImportRow,
} from "./transactions";

let db: Db;
let checking: number;
let groceries: number;

const createGroup = (database: Db, name: string) => created(budget.createGroup(database, name));
const createCategory = (database: Db, name: string, groupId: number) =>
  created(budget.createCategory(database, name, groupId));

/** A row as a bank file would hold it: the raw line is what identifies it. */
const row = (
  date: IsoDate,
  amount: number,
  payee: string,
  note: string | null = null,
): ImportRow => ({
  date,
  amount,
  payee,
  note,
  raw: [date, payee, note ?? "", amount].join(";"),
});

const november: ImportRow[] = [
  row("2026-11-01", 285_000, "Acme Corp", "Salary November"),
  row("2026-11-03", -4_510, "Fresh Market"),
  row("2026-11-05", -350, "Coffee Bar"),
  row("2026-11-05", -350, "Coffee Bar"),
];

beforeEach(() => {
  db = openDb(":memory:");
  checking = createAccount(db, {
    name: "Checking",
    type: "checking",
    startingBalance: 100_000,
    date: "2026-10-31",
  });
  groceries = createCategory(db, "Groceries", createGroup(db, "Everyday"));
});

describe("importing", () => {
  it("adds the rows and marks them to sort", () => {
    expect(importTransactions(db, checking, november, "a")).toEqual({ imported: 4, duplicates: 0 });
    expect(countTransactions(db)).toEqual({ all: 5, toSort: 4 });
    expect(getAccounts(db)[0].balance).toBe(100_000 + 285_000 - 4_510 - 700);
  });

  it("keeps two identical rows from the same file", () => {
    importTransactions(db, checking, november, "a");
    const coffees = listTransactions(db, { limit: 50 }).filter((t) => t.payee === "Coffee Bar");
    expect(coffees).toHaveLength(2);
  });

  it("skips rows that were imported before, so files may overlap", () => {
    importTransactions(db, checking, november, "a");
    const overlapping = [...november.slice(1), row("2026-11-09", -1_200, "Bakery")];
    expect(importTransactions(db, checking, overlapping, "b")).toEqual({
      imported: 1,
      duplicates: 3,
    });
    expect(countTransactions(db).all).toBe(6);
  });

  it("treats the same row in another account as a different transaction", () => {
    const savings = createAccount(db, {
      name: "Savings",
      type: "savings",
      startingBalance: 0,
      date: "2026-10-31",
    });
    importTransactions(db, checking, november, "a");
    expect(importTransactions(db, savings, november, "b")?.imported).toBe(4);
  });

  it("refuses an account that does not exist", () => {
    expect(importTransactions(db, 9999, november, "a")).toBeNull();
    expect(countTransactions(db).all).toBe(1);
  });

  it("can be undone as a whole, without touching other transactions", () => {
    importTransactions(db, checking, november, "a");
    importTransactions(db, checking, [row("2026-11-09", -1_200, "Bakery")], "b");
    expect(undoImport(db, "a")).toEqual({ removed: 4, sorted: 0 });
    expect(listTransactions(db, { limit: 50 }).map((t) => t.payee)).toEqual([
      "Bakery",
      "Starting balance",
    ]);
    // After undoing, the same file can be imported again.
    expect(importTransactions(db, checking, november, "c")?.imported).toBe(4);
  });

  it("recognises a row it has seen even when the columns were read differently", () => {
    importTransactions(db, checking, november, "a");
    // The same file again, this time with no note column and another payee column.
    const readDifferently = november.map((r) => ({
      ...r,
      payee: "NL01BANK0123456789",
      note: null,
    }));
    expect(importTransactions(db, checking, readDifferently, "b")).toEqual({
      imported: 0,
      duplicates: 4,
    });
  });

  it("refuses to undo an import once any of it has been sorted", () => {
    importTransactions(db, checking, november, "a");
    const market = listTransactions(db, { limit: 50 }).find((t) => t.payee === "Fresh Market")!;
    sortTransaction(db, market.id, groceries);

    expect(undoImport(db, "a")).toEqual({ removed: 0, sorted: 1 });
    expect(countTransactions(db).all).toBe(5);

    // Sending it back to "to sort" makes the import undoable again.
    sortTransaction(db, market.id, "unsorted");
    expect(undoImport(db, "a")).toEqual({ removed: 4, sorted: 0 });
  });

  it("counts income and unsorted spending towards ready to assign straight away", () => {
    importTransactions(db, checking, november, "a");
    expect(getBudgetMonth(db, "2026-11").readyToAssign).toBe(100_000 + 285_000 - 4_510 - 700);
  });
});

describe("finding rows that are known already", () => {
  it("finds nothing in an account that has imported nothing", () => {
    expect(findKnownRows(db, checking, november)).toEqual([]);
    expect(findKnownRows(db, checking, [])).toEqual([]);
  });

  it("finds the rows an earlier import brought in, telling identical rows apart", () => {
    importTransactions(db, checking, november.slice(0, 3), "a");
    // The file has two identical coffees; only the first was imported.
    expect(findKnownRows(db, checking, november)).toEqual([0, 1, 2]);
    importTransactions(db, checking, november, "b");
    expect(findKnownRows(db, checking, november)).toEqual([0, 1, 2, 3]);
  });

  it("knows only the rows of the account asked about", () => {
    const savings = createAccount(db, {
      name: "Savings",
      type: "savings",
      startingBalance: 0,
      date: "2026-10-31",
    });
    importTransactions(db, checking, november, "a");
    expect(findKnownRows(db, savings, november)).toEqual([]);
  });

  it("counts rows that were imported and then deleted by hand", () => {
    importTransactions(db, checking, november.slice(0, 2), "a");
    const [gone] = db
      .select()
      .from(transactions)
      .where(eq(transactions.payee, "Fresh Market"))
      .all();
    db.delete(transactions).where(eq(transactions.id, gone.id)).run();
    expect(findKnownRows(db, checking, november)).toEqual([0]);
    db.insert(deletedImports).values({ accountId: checking, importId: gone.importId! }).run();
    expect(findKnownRows(db, checking, november)).toEqual([0, 1]);
  });
});

describe("sorting", () => {
  let market: number;
  let salary: number;

  beforeEach(() => {
    importTransactions(db, checking, november, "a");
    const all = listTransactions(db, { limit: 50 });
    market = all.find((t) => t.payee === "Fresh Market")!.id;
    salary = all.find((t) => t.payee === "Acme Corp")!.id;
  });

  it("lists newest first and can show only what is left to sort", () => {
    expect(listTransactions(db, { limit: 2 }).map((t) => t.date)).toEqual([
      "2026-11-05",
      "2026-11-05",
    ]);
    sortTransaction(db, market, groceries);
    const left = listTransactions(db, { only: "to-sort", limit: 50 });
    expect(left.map((t) => t.payee)).toEqual(["Coffee Bar", "Coffee Bar", "Acme Corp"]);
  });

  it("moves spending into the category and out of ready to assign", () => {
    setAssigned(db, groceries, "2026-11", 30_000);
    const before = getBudgetMonth(db, "2026-11").readyToAssign;
    expect(sortTransaction(db, market, groceries)).toBe("sorted");

    const budget = getBudgetMonth(db, "2026-11");
    expect(budget.groups[0].categories[0]).toMatchObject({ activity: -4_510, available: 25_490 });
    expect(budget.readyToAssign).toBe(before + 4_510);
    expect(countTransactions(db).toSort).toBe(3);
  });

  it("can mark income as sorted without a category", () => {
    const before = getBudgetMonth(db, "2026-11").readyToAssign;
    expect(sortTransaction(db, salary, "ready")).toBe("sorted");
    expect(getBudgetMonth(db, "2026-11").readyToAssign).toBe(before);
    expect(countTransactions(db).toSort).toBe(3);
    expect(listTransactions(db, { limit: 50 }).find((t) => t.id === salary)).toMatchObject({
      categoryId: null,
      toSort: false,
    });
  });

  it("can send a transaction back to the to-sort list", () => {
    sortTransaction(db, market, groceries);
    sortTransaction(db, market, "unsorted");
    expect(listTransactions(db, { limit: 50 }).find((t) => t.id === market)).toMatchObject({
      categoryId: null,
      toSort: true,
    });
  });

  it("keeps showing the name of a category that was archived later", () => {
    sortTransaction(db, market, groceries);
    archiveCategory(db, groceries);
    expect(listTransactions(db, { limit: 50 }).find((t) => t.id === market)).toMatchObject({
      categoryId: groceries,
      category: "Groceries",
      categoryArchived: true,
      toSort: false,
    });
    expect(listTransactions(db, { limit: 50 }).find((t) => t.id === salary)).toMatchObject({
      category: null,
      categoryArchived: false,
    });
  });

  it("says which is missing: the category or the transaction", () => {
    expect(sortTransaction(db, market, 9999)).toBe("no-category");
    archiveCategory(db, groceries);
    expect(sortTransaction(db, market, groceries)).toBe("no-category");
    expect(sortTransaction(db, 9999, "ready")).toBe("no-transaction");
    expect(sortTransaction(db, 9999, groceries)).toBe("no-transaction");
    expect(countTransactions(db).toSort).toBe(4);
  });
});

describe("options and saved mappings", () => {
  it("lists categories grouped as on the budget page, without archived ones", () => {
    const goals = createGroup(db, "Goals");
    createCategory(db, "Holiday", goals);
    const old = createCategory(db, "Old", goals);
    archiveCategory(db, old);
    expect(getCategoryOptions(db).map((g) => [g.name, g.categories.map((e) => e.name)])).toEqual([
      ["Everyday", ["Groceries"]],
      ["Goals", ["Holiday"]],
    ]);
  });

  it("remembers how an account's file was read", () => {
    expect(getImportAccounts(db)).toEqual([
      { id: checking, name: "Checking", importMapping: null },
    ]);
    saveImportMapping(db, checking, '{"date":0}');
    expect(getImportAccounts(db)[0].importMapping).toBe('{"date":0}');
  });
});

describe("paging", () => {
  it("continues after the last row of the previous page, also within one day", () => {
    importTransactions(db, checking, november, "a");
    const first = listTransactions(db, { limit: 3 });
    expect(first.map((t) => t.payee)).toEqual(["Coffee Bar", "Coffee Bar", "Fresh Market"]);

    const last = first[2];
    const second = listTransactions(db, { before: { date: last.date, id: last.id }, limit: 3 });
    expect(second.map((t) => t.payee)).toEqual(["Acme Corp", "Starting balance"]);

    // A cursor in the middle of a day keeps the rows of that day that come after it.
    const coffee = first[1];
    expect(
      listTransactions(db, { before: { date: coffee.date, id: coffee.id }, limit: 1 })[0].id,
    ).toBeLessThan(coffee.id);
  });

  it("pages through the list that is to sort", () => {
    importTransactions(db, checking, november, "a");
    const [newest] = listTransactions(db, { only: "to-sort", limit: 1 });
    expect(
      listTransactions(db, {
        only: "to-sort",
        before: { date: newest.date, id: newest.id },
        limit: 10,
      }).map((t) => t.payee),
    ).toEqual(["Coffee Bar", "Fresh Market", "Acme Corp"]);
  });
});

describe("finding transactions", () => {
  let savings: number;

  beforeEach(() => {
    savings = createAccount(db, {
      name: "Savings",
      type: "savings",
      startingBalance: 0,
      date: "2026-10-31",
    });
    importTransactions(db, checking, november, "a");
    importTransactions(
      db,
      savings,
      [
        row("2026-10-30", -2_000, "Bakery", "Bread for 50% off"),
        row("2026-12-01", 10_000, "Interest", "Quarter_1"),
      ],
      "b",
    );
    const market = listTransactions(db, { limit: 50 }).find((t) => t.payee === "Fresh Market")!;
    sortTransaction(db, market.id, groceries);
    // Creating an account does not mark its starting balance yet; do it as the app does.
    db.update(transactions)
      .set({ starting: true })
      .where(eq(transactions.payee, "Starting balance"))
      .run();
  });

  const payees = (filter: Parameters<typeof summarizeTransactions>[1]) =>
    listTransactions(db, { filter, limit: 50 }).map((t) => t.payee);

  it("searches payee and note, ignoring case", () => {
    expect(payees({ q: "coffee" })).toEqual(["Coffee Bar", "Coffee Bar"]);
    expect(payees({ q: "SALARY" })).toEqual(["Acme Corp"]);
    expect(payees({ q: "nothing like it" })).toEqual([]);
  });

  it("takes % and _ in a search as plain characters", () => {
    expect(payees({ q: "50%" })).toEqual(["Bakery"]);
    expect(payees({ q: "%" })).toEqual(["Bakery"]);
    expect(payees({ q: "Quarter_1" })).toEqual(["Interest"]);
    expect(payees({ q: "Quarter?1" })).toEqual([]);
    expect(payees({ q: "_" })).toEqual(["Interest"]);
  });

  it("narrows to an account, a category, or no category", () => {
    expect(payees({ accountId: savings })).toEqual(["Interest", "Bakery"]);
    expect(payees({ category: groceries })).toEqual(["Fresh Market"]);
    expect(payees({ category: "none" })).toEqual([
      "Interest",
      "Coffee Bar",
      "Coffee Bar",
      "Acme Corp",
      "Bakery",
    ]);
  });

  it("does not count a starting balance as having no category", () => {
    expect(payees({ category: "none" })).not.toContain("Starting balance");
  });

  it("narrows to a month, from its first to its last day", () => {
    importTransactions(db, checking, [row("2026-11-30", -100, "Last day")], "c");
    expect(payees({ month: "2026-11" })).toEqual([
      "Last day",
      "Coffee Bar",
      "Coffee Bar",
      "Fresh Market",
      "Acme Corp",
    ]);
    expect(payees({ month: "2026-12" })).toEqual(["Interest"]);
  });

  it("combines filters and pages through the result", () => {
    const filter = { month: "2026-11", category: "none" } as const;
    expect(payees(filter)).toEqual(["Coffee Bar", "Coffee Bar", "Acme Corp"]);
    const [newest] = listTransactions(db, { filter, limit: 1 });
    expect(
      listTransactions(db, {
        filter,
        before: { date: newest.date, id: newest.id },
        limit: 10,
      }).map((t) => t.payee),
    ).toEqual(["Coffee Bar", "Acme Corp"]);
  });

  it("sums everything that matches, not one page", () => {
    expect(summarizeTransactions(db, { month: "2026-11" })).toEqual({
      count: 4,
      moneyIn: 285_000,
      moneyOut: -4_510 - 700,
    });
    expect(summarizeTransactions(db, { q: "nothing like it" })).toEqual({
      count: 0,
      moneyIn: 0,
      moneyOut: 0,
    });
  });

  it("does not count a starting balance as money in", () => {
    const all = summarizeTransactions(db, {});
    expect(all.count).toBe(7);
    expect(all.moneyIn).toBe(285_000 + 10_000);
  });

  it("lists every account and category to choose from, archived ones too", () => {
    const old = createCategory(db, "Old", createGroup(db, "Goals"));
    archiveCategory(db, old);
    expect(getFilterOptions(db)).toEqual({
      accounts: [
        { id: checking, name: "Checking" },
        { id: savings, name: "Savings" },
      ],
      categories: [
        { id: groceries, name: "Groceries", archived: false },
        { id: old, name: "Old", archived: true },
      ],
    });
  });
});

describe("suggesting a category", () => {
  let rent: number;

  beforeEach(() => {
    rent = createCategory(db, "Rent", createGroup(db, "Fixed"));
  });

  const sortedLike = (
    date: IsoDate,
    payee: string,
    target: Parameters<typeof sortTransaction>[2],
  ) => {
    importTransactions(db, checking, [row(date, -100, payee)], `batch ${date} ${payee}`);
    const [added] = listTransactions(db, { limit: 50 }).filter(
      (t) => t.payee === payee && t.date === date,
    );
    sortTransaction(db, added.id, target);
  };

  it("suggests where the latest sorted transaction with that payee went", () => {
    sortedLike("2026-09-01", "Corner Shop", groceries);
    sortedLike("2026-10-01", "Corner Shop", rent);
    expect(suggestCategories(db, ["Corner Shop"]).get("Corner Shop")).toEqual({
      categoryId: rent,
      category: "Rent",
    });
  });

  it("ignores case and surrounding spaces, and answers for the payee as given", () => {
    sortedLike("2026-09-01", "corner shop", groceries);
    const suggestions = suggestCategories(db, ["  CORNER SHOP", "Corner Shop "]);
    expect(suggestions.get("  CORNER SHOP")?.category).toBe("Groceries");
    expect(suggestions.get("Corner Shop ")?.category).toBe("Groceries");
  });

  it("can suggest no category", () => {
    sortedLike("2026-09-01", "Employer", "ready");
    expect(suggestCategories(db, ["Employer"]).get("Employer")).toEqual({
      categoryId: null,
      category: null,
    });
  });

  it("suggests nothing for a payee not sorted yet, or whose category was archived", () => {
    sortedLike("2026-09-01", "Corner Shop", groceries);
    importTransactions(db, checking, [row("2026-09-02", -100, "Unsorted Co")], "u");
    archiveCategory(db, groceries);
    expect(suggestCategories(db, ["Corner Shop", "Unsorted Co", "Nobody"]).size).toBe(0);
  });

  it("does not suggest from a starting balance or from another payee", () => {
    db.update(transactions)
      .set({ starting: true, toSort: false, categoryId: rent })
      .where(eq(transactions.payee, "Starting balance"))
      .run();
    sortedLike("2026-09-01", "Corner Shop Two", groceries);
    expect(suggestCategories(db, ["Starting balance", "Corner Shop"]).size).toBe(0);
  });

  it("answers for no payees", () => {
    expect(suggestCategories(db, []).size).toBe(0);
  });
});

describe("deleting", () => {
  it("removes a transaction and what it did to the balance", () => {
    importTransactions(db, checking, november, "a");
    const market = listTransactions(db, { limit: 50 }).find((t) => t.payee === "Fresh Market")!;
    expect(deleteTransaction(db, market.id)).toBe("deleted");
    expect(countTransactions(db)).toEqual({ all: 4, toSort: 3 });
    expect(getAccounts(db)[0].balance).toBe(100_000 + 285_000 - 700);
  });

  it("keeps a deleted import from coming back with the next file", () => {
    importTransactions(db, checking, november, "a");
    const coffees = listTransactions(db, { limit: 50 }).filter((t) => t.payee === "Coffee Bar");
    deleteTransaction(db, coffees[0].id);

    // The same file again: the deleted row is skipped and counted as a duplicate.
    expect(importTransactions(db, checking, november, "b")).toEqual({ imported: 0, duplicates: 4 });
    expect(countTransactions(db).all).toBe(4);

    // Other rows and other accounts are not affected.
    const savings = createAccount(db, {
      name: "Savings",
      type: "savings",
      startingBalance: 0,
      date: "2026-10-31",
    });
    expect(importTransactions(db, savings, november, "c")?.imported).toBe(4);
  });

  it("says when the transaction is gone, and keeps a starting balance", () => {
    expect(deleteTransaction(db, 9999)).toBe("no-transaction");
    const start = listTransactions(db, { limit: 50 })[0];
    db.update(transactions).set({ starting: true }).where(eq(transactions.id, start.id)).run();
    expect(deleteTransaction(db, start.id)).toBe("starting");
    expect(countTransactions(db).all).toBe(1);
  });
});
