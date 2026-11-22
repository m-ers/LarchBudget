import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { IsoDate } from "../lib/dates";
import { closeAccount, createAccount, deleteAccount, getAccounts } from "./accounts";
import * as budget from "./budget";
import { archiveCategory, getBudgetMonth, setAssigned } from "./budget";
import { openDb, type Db } from "./index";
import { created } from "./created";
import { categories, deletedImports, transactions, transactionSplits } from "./schema";
import {
  addTransaction,
  countTransactions,
  deleteTransaction,
  editTransaction,
  findKnownRows,
  getCategoryOptions,
  getFilterOptions,
  getImportAccounts,
  importTransactions,
  listTransactions,
  MIN_PARTS,
  saveImportMapping,
  sortTransaction,
  suggestCategories,
  summarizeTransactions,
  undoImport,
  type ImportRow,
  type TransactionInput,
} from "./transactions";

let db: Db;
let checking: number;
let groceries: number;

const createGroup = (database: Db, name: string) => created(budget.createGroup(database, name));
const createCategory = (database: Db, name: string, groupId: number) =>
  created(budget.createCategory(database, name, groupId));
const createIncomeCategory = (name: string) => created(budget.createIncomeCategory(db, name));

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
  checking = created(
    createAccount(db, {
      name: "Checking",
      type: "checking",
      startingBalance: 100_000,
      balanceDate: "2026-10-31",
    }),
  );
  groceries = createCategory(db, "Groceries", createGroup(db, "Everyday"));
});

describe("importing", () => {
  it("adds the rows and marks them to sort", () => {
    expect(importTransactions(db, checking, november, "a")).toMatchObject({
      imported: 4,
      duplicates: 0,
    });
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
    expect(importTransactions(db, checking, overlapping, "b")).toMatchObject({
      imported: 1,
      duplicates: 3,
    });
    expect(countTransactions(db).all).toBe(6);
  });

  it("treats the same row in another account as a different transaction", () => {
    const savings = created(
      createAccount(db, {
        name: "Savings",
        type: "savings",
        startingBalance: 0,
        balanceDate: "2026-10-31",
      }),
    );
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
    expect(undoImport(db, "a")).toMatchObject({ removed: 4, sorted: 0 });
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
    expect(importTransactions(db, checking, readDifferently, "b")).toMatchObject({
      imported: 0,
      duplicates: 4,
    });
  });

  it("refuses to undo an import once any of it has been sorted", () => {
    importTransactions(db, checking, november, "a");
    const market = listTransactions(db, { limit: 50 }).find((t) => t.payee === "Fresh Market")!;
    sortTransaction(db, market.id, groceries);

    expect(undoImport(db, "a")).toMatchObject({ removed: 0, sorted: 1 });
    expect(countTransactions(db).all).toBe(5);

    // Sending it back to "to sort" makes the import undoable again.
    sortTransaction(db, market.id, "unsorted");
    expect(undoImport(db, "a")).toMatchObject({ removed: 4, sorted: 0 });
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
    const savings = created(
      createAccount(db, {
        name: "Savings",
        type: "savings",
        startingBalance: 0,
        balanceDate: "2026-10-31",
      }),
    );
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

  it("can put income in an income category, which counts the same as no category", () => {
    const salaryCategory = createIncomeCategory("Salary");
    expect(sortTransaction(db, salary, "ready")).toBe("sorted");
    const withoutCategory = getBudgetMonth(db, "2026-11");

    expect(sortTransaction(db, salary, salaryCategory)).toBe("sorted");
    const withCategory = getBudgetMonth(db, "2026-11");
    expect(withCategory.readyToAssign).toBe(withoutCategory.readyToAssign);
    expect(withCategory.income.received).toBe(285_000);
    expect(listTransactions(db, { limit: 50 }).find((t) => t.id === salary)).toMatchObject({
      categoryId: salaryCategory,
      category: "Salary",
      toSort: false,
    });

    // Once archived, nothing more goes in.
    archiveCategory(db, salaryCategory);
    expect(sortTransaction(db, market, salaryCategory)).toBe("no-category");
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

  it("lists the income categories first, apart from any group", () => {
    const everyday = getCategoryOptions(db)[0].id;
    // An expense group may be called Income too; it stays a group of its own.
    const named = createGroup(db, "Income");
    createCategory(db, "Gifts", named);
    createIncomeCategory("Salary");
    createIncomeCategory("Benefits");
    archiveCategory(db, createIncomeCategory("Old job"));
    const loose = createCategory(db, "Loose", everyday as number);
    db.update(categories).set({ groupId: null }).where(eq(categories.id, loose)).run();

    expect(
      getCategoryOptions(db).map((g) => [g.id, g.name, g.categories.map((c) => c.name)]),
    ).toEqual([
      ["income", "Income", ["Salary", "Benefits"]],
      [everyday, "Everyday", ["Groceries"]],
      [named, "Income", ["Gifts"]],
      [null, budget.UNGROUPED, ["Loose"]],
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
    // Empty before any of its rows below, so it gets no starting balance of its own.
    savings = created(
      createAccount(db, {
        name: "Savings",
        type: "savings",
        startingBalance: 0,
        balanceDate: "2026-09-30",
      }),
    );
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

  it("lists every account and category to choose from, archived and income ones too", () => {
    const old = createCategory(db, "Old", createGroup(db, "Goals"));
    archiveCategory(db, old);
    const salary = createIncomeCategory("Salary");
    expect(getFilterOptions(db)).toEqual({
      accounts: [
        { id: checking, name: "Checking", closed: false },
        { id: savings, name: "Savings", closed: false },
      ],
      categories: [
        { id: groceries, name: "Groceries", archived: false, income: false },
        { id: salary, name: "Salary", archived: false, income: true },
        { id: old, name: "Old", archived: true, income: false },
      ],
      months: ["2026-12", "2026-11", "2026-10"],
    });
  });

  it("narrows to an income category like to any other", () => {
    const salary = createIncomeCategory("Salary");
    const acme = listTransactions(db, { limit: 50 }).find((t) => t.payee === "Acme Corp")!;
    sortTransaction(db, acme.id, salary);
    expect(payees({ category: salary })).toEqual(["Acme Corp"]);
    expect(payees({ category: salary, month: "2026-11" })).toEqual(["Acme Corp"]);
    expect(payees({ category: "none" })).not.toContain("Acme Corp");
    expect(summarizeTransactions(db, { category: salary, month: "2026-11" })).toEqual({
      count: 1,
      moneyIn: 285_000,
      moneyOut: 0,
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

  it("suggests an income category like any other", () => {
    const salary = createIncomeCategory("Salary");
    importTransactions(db, checking, [row("2026-10-01", 285_000, "Acme Corp")], "salary");
    const [added] = listTransactions(db, { limit: 50 }).filter((t) => t.payee === "Acme Corp");
    sortTransaction(db, added.id, salary);
    expect(suggestCategories(db, ["Acme Corp"]).get("Acme Corp")).toEqual({
      categoryId: salary,
      category: "Salary",
    });
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
    expect(importTransactions(db, checking, november, "b")).toMatchObject({
      imported: 0,
      duplicates: 4,
    });
    expect(countTransactions(db).all).toBe(4);

    // Other rows and other accounts are not affected.
    const savings = created(
      createAccount(db, {
        name: "Savings",
        type: "savings",
        startingBalance: 0,
        balanceDate: "2026-10-31",
      }),
    );
    expect(importTransactions(db, savings, november, "c")?.imported).toBe(4);
  });

  it("says when the transaction is gone, and keeps a starting balance", () => {
    expect(deleteTransaction(db, 9999)).toBe("no-transaction");
    const start = listTransactions(db, { limit: 50 })[0];
    expect(start.payee).toBe("Starting balance");
    expect(deleteTransaction(db, start.id)).toBe("starting");
    expect(countTransactions(db).all).toBe(1);
  });

  it("does not put a starting balance in a category or back on the to-sort list", () => {
    const start = listTransactions(db, { limit: 50 })[0];
    expect(sortTransaction(db, start.id, groceries)).toBe("starting");
    expect(sortTransaction(db, start.id, "unsorted")).toBe("starting");
    expect(countTransactions(db)).toEqual({ all: 1, toSort: 0 });
  });

  it("keeps what the account held on its balance date when older history is deleted", () => {
    // History from before 31 October, which the entered 1,000.00 already includes.
    importTransactions(
      db,
      checking,
      [
        { date: "2026-10-05", amount: -4_000, payee: "Bookshop", note: null, raw: "o1" },
        { date: "2026-10-20", amount: 30_000, payee: "Refund", note: null, raw: "o2" },
      ],
      "old",
    );
    expect(getAccounts(db)[0].balance).toBe(100_000);

    const bookshop = listTransactions(db, { limit: 50 }).find((t) => t.payee === "Bookshop")!;
    expect(deleteTransaction(db, bookshop.id)).toBe("deleted");
    expect(getAccounts(db)[0].balance).toBe(100_000);
  });
});

/** Helpers for transactions made and changed by hand. */
const input = (over: Partial<TransactionInput> = {}): TransactionInput => ({
  date: "2026-11-10",
  amount: -1_000,
  payee: "Cash",
  note: null,
  place: groceries,
  ...over,
});

const add = (over: Partial<TransactionInput> = {}, accountId = checking) => {
  const result = addTransaction(db, accountId, input(over));
  if (typeof result === "string") throw new Error(`Not added: ${result}`);
  return result.id;
};

const find = (id: number) => listTransactions(db, { limit: 100 }).find((t) => t.id === id)!;
const balance = () => getAccounts(db).find((a) => a.id === checking)!.balance;
const splitRows = () => db.select().from(transactionSplits).all();

describe("adding by hand", () => {
  it("adds to an open account, in the category given", () => {
    const id = add();
    expect(find(id)).toMatchObject({
      amount: -1_000,
      payee: "Cash",
      categoryId: groceries,
      toSort: false,
      imported: false,
      parts: [],
    });
  });

  it("is not to sort with ready, and to sort with unsorted", () => {
    expect(find(add({ place: "ready" }))).toMatchObject({ categoryId: null, toSort: false });
    expect(find(add({ place: "unsorted" }))).toMatchObject({ categoryId: null, toSort: true });
  });

  it("refuses an account that does not exist or is closed", () => {
    expect(addTransaction(db, 999, input())).toBe("no-account");
    const old = created(
      createAccount(db, {
        name: "Old",
        type: "savings",
        startingBalance: 0,
        balanceDate: "2026-10-31",
      }),
    );
    expect(closeAccount(db, old)).toBe("closed");
    expect(addTransaction(db, old, input())).toBe("no-account");
    expect(countTransactions(db).all).toBe(1);
  });

  it("refuses an archived or missing category and writes nothing", () => {
    const old = createCategory(db, "Old", createGroup(db, "Past"));
    archiveCategory(db, old);
    expect(addTransaction(db, checking, input({ place: old }))).toBe("no-category");
    expect(addTransaction(db, checking, input({ place: 999 }))).toBe("no-category");
    expect(countTransactions(db).all).toBe(1);
    expect(balance()).toBe(100_000);
  });

  it("leaves what the account holds on the balance date alone when dated on or before it", () => {
    add({ date: "2026-10-31", amount: -2_000 });
    add({ date: "2026-10-01", amount: 500 });
    expect(balance()).toBe(100_000);
  });

  it("changes the balance by its amount when dated after the balance date", () => {
    add({ date: "2026-11-01", amount: -2_000 });
    expect(balance()).toBe(98_000);
  });
});

describe("editing by hand", () => {
  it("changes the date, amount, payee, note and place", () => {
    const id = add();
    const rent = createCategory(db, "Rent", createGroup(db, "Home"));
    expect(
      editTransaction(
        db,
        id,
        input({ date: "2026-11-12", amount: -2_500, payee: "Landlord", note: "Nov", place: rent }),
      ),
    ).toBe("saved");
    expect(find(id)).toMatchObject({
      date: "2026-11-12",
      amount: -2_500,
      payee: "Landlord",
      note: "Nov",
      categoryId: rent,
      toSort: false,
    });
    expect(balance()).toBe(97_500);
  });

  it("can put it back to sort", () => {
    const id = add();
    expect(editTransaction(db, id, input({ place: "unsorted" }))).toBe("saved");
    expect(find(id)).toMatchObject({ categoryId: null, toSort: true });
  });

  it("keeps the starting balance rule when moved from after the balance date to before it", () => {
    const id = add({ date: "2026-11-05", amount: -2_000 });
    expect(balance()).toBe(98_000);
    expect(editTransaction(db, id, input({ date: "2026-10-20", amount: -2_000 }))).toBe("saved");
    expect(balance()).toBe(100_000);
    expect(editTransaction(db, id, input({ date: "2026-11-05", amount: -3_000 }))).toBe("saved");
    expect(balance()).toBe(97_000);
  });

  it("keeps the starting balance rule when the amount changes before the balance date", () => {
    const id = add({ date: "2026-10-20", amount: -2_000 });
    editTransaction(db, id, input({ date: "2026-10-20", amount: -9_000 }));
    expect(balance()).toBe(100_000);
  });

  it("says so for a transaction that does not exist", () => {
    expect(editTransaction(db, 999, input())).toBe("no-transaction");
  });

  it("does not change the starting balance row", () => {
    const starting = listTransactions(db, { limit: 10 }).find((t) => t.starting)!;
    expect(editTransaction(db, starting.id, input())).toBe("starting");
    expect(find(starting.id)).toMatchObject({ amount: 100_000, payee: starting.payee });
  });
});

describe("editing an imported transaction", () => {
  const imported = () => {
    importTransactions(db, checking, november, "a");
    return listTransactions(db, { limit: 50 }).find((t) => t.payee === "Fresh Market")!;
  };

  it("is marked imported", () => {
    expect(imported().imported).toBe(true);
  });

  it("can change payee, note and place", () => {
    const t = imported();
    expect(
      editTransaction(
        db,
        t.id,
        input({
          date: t.date,
          amount: t.amount,
          payee: "Market",
          note: "weekly",
          place: groceries,
        }),
      ),
    ).toBe("saved");
    expect(find(t.id)).toMatchObject({
      payee: "Market",
      note: "weekly",
      categoryId: groceries,
      toSort: false,
    });
  });

  it("refuses a changed date or amount and changes nothing, payee included", () => {
    const t = imported();
    const before = find(t.id);
    expect(
      editTransaction(db, t.id, input({ date: "2026-11-04", amount: t.amount, payee: "Other" })),
    ).toBe("imported");
    expect(
      editTransaction(db, t.id, input({ date: t.date, amount: t.amount - 1, payee: "Other" })),
    ).toBe("imported");
    expect(find(t.id)).toEqual(before);
    expect(getAccounts(db)[0].balance).toBe(100_000 + 285_000 - 4_510 - 700);
  });

  it("is not added again by the same file, and keeps the edits", () => {
    const t = imported();
    editTransaction(
      db,
      t.id,
      input({ date: t.date, amount: t.amount, payee: "Market", place: groceries }),
    );
    const again = importTransactions(db, checking, november, "b");
    expect(again).toMatchObject({ imported: 0 });
    expect(countTransactions(db).all).toBe(5);
    expect(find(t.id)).toMatchObject({ payee: "Market", categoryId: groceries, toSort: false });
  });
});

describe("editing on a closed account", () => {
  let old: number;
  let id: number;

  beforeEach(() => {
    old = created(
      createAccount(db, {
        name: "Old",
        type: "savings",
        startingBalance: 0,
        balanceDate: "2026-10-31",
      }),
    );
    id = add({ date: "2026-11-02", amount: 500 }, old);
    add({ date: "2026-11-03", amount: -500 }, old);
    expect(closeAccount(db, old)).toBe("closed");
  });

  it("refuses a changed date or amount", () => {
    expect(editTransaction(db, id, input({ date: "2026-11-09", amount: 500 }))).toBe("closed");
    expect(editTransaction(db, id, input({ date: "2026-11-02", amount: 600 }))).toBe("closed");
    expect(find(id)).toMatchObject({ date: "2026-11-02", amount: 500 });
  });

  it("still allows payee, note and category", () => {
    expect(
      editTransaction(
        db,
        id,
        input({ date: "2026-11-02", amount: 500, payee: "Gift", note: "x", place: "ready" }),
      ),
    ).toBe("saved");
    expect(find(id)).toMatchObject({ payee: "Gift", note: "x", categoryId: null });
  });
});

describe("editing with an archived category", () => {
  let old: number;

  beforeEach(() => {
    old = createCategory(db, "Old", createGroup(db, "Past"));
  });

  it("keeps the category a transaction is in", () => {
    const id = add({ place: old });
    archiveCategory(db, old);
    expect(editTransaction(db, id, input({ place: old, payee: "Changed" }))).toBe("saved");
    expect(find(id)).toMatchObject({ categoryId: old, payee: "Changed", categoryArchived: true });
  });

  it("keeps the category of one of its parts", () => {
    const parts = [
      { categoryId: old, amount: -600 },
      { categoryId: groceries, amount: -400 },
    ];
    const id = add({ place: parts });
    archiveCategory(db, old);
    expect(editTransaction(db, id, input({ place: parts, note: "n" }))).toBe("saved");
    expect(find(id).parts).toHaveLength(2);
  });

  it("does not take a transaction into it", () => {
    const id = add();
    archiveCategory(db, old);
    expect(editTransaction(db, id, input({ place: old }))).toBe("no-category");
    expect(
      editTransaction(
        db,
        id,
        input({
          place: [
            { categoryId: old, amount: -500 },
            { categoryId: groceries, amount: -500 },
          ],
        }),
      ),
    ).toBe("no-category");
    expect(find(id)).toMatchObject({ categoryId: groceries, parts: [] });
  });
});

describe("splits", () => {
  let rent: number;
  const parts = (...amounts: [number | null, number][]) =>
    amounts.map(([categoryId, amount]) => ({ categoryId, amount }));

  beforeEach(() => {
    rent = createCategory(db, "Rent", createGroup(db, "Home"));
  });

  it("needs at least two parts", () => {
    expect(MIN_PARTS).toBe(2);
    expect(addTransaction(db, checking, input({ place: parts([groceries, -1_000]) }))).toBe(
      "parts",
    );
    expect(addTransaction(db, checking, input({ place: [] }))).toBe("parts");
  });

  it("refuses a part of 0", () => {
    const place = parts([groceries, -1_000], [rent, 0], [null, 0]);
    expect(addTransaction(db, checking, input({ place }))).toBe("parts");
    const two = parts([groceries, -1_000], [rent, 0]);
    expect(addTransaction(db, checking, input({ place: two }))).toBe("parts");
  });

  it("refuses parts that do not add up and changes nothing", () => {
    expect(
      addTransaction(db, checking, input({ place: parts([groceries, -600], [rent, -399]) })),
    ).toBe("parts");
    expect(
      addTransaction(db, checking, input({ place: parts([groceries, -600], [rent, -401]) })),
    ).toBe("parts");
    expect(countTransactions(db).all).toBe(1);

    const id = add({ place: parts([groceries, -600], [rent, -400]) });
    const before = find(id);
    expect(editTransaction(db, id, input({ place: parts([groceries, -1], [rent, -1]) }))).toBe(
      "parts",
    );
    expect(editTransaction(db, id, input({ amount: -2_000, place: before.parts }))).toBe("parts");
    expect(find(id)).toEqual(before);
    expect(splitRows()).toHaveLength(2);
  });

  it("allows parts with different signs when they add up", () => {
    const id = add({ place: parts([groceries, -1_500], [rent, 500]) });
    expect(find(id).parts.map((p) => p.amount)).toEqual([-1_500, 500]);
  });

  it("has no category, is not to sort, and lists its parts in order", () => {
    const id = add({ place: parts([rent, -300], [null, -200], [groceries, -500]) });
    expect(find(id)).toMatchObject({ categoryId: null, category: null, toSort: false });
    expect(find(id).parts).toEqual([
      { categoryId: rent, category: "Rent", categoryArchived: false, amount: -300 },
      { categoryId: null, category: null, categoryArchived: false, amount: -200 },
      { categoryId: groceries, category: "Groceries", categoryArchived: false, amount: -500 },
    ]);
  });

  it("is replaced by one category, which removes the parts", () => {
    const id = add({ place: parts([groceries, -600], [rent, -400]) });
    expect(editTransaction(db, id, input({ place: rent }))).toBe("saved");
    expect(find(id)).toMatchObject({ categoryId: rent, parts: [] });
    expect(splitRows()).toEqual([]);
  });

  it("is replaced by other parts, leaving only the new ones", () => {
    const id = add({ place: parts([groceries, -600], [rent, -400]) });
    expect(editTransaction(db, id, input({ place: parts([rent, -700], [null, -300]) }))).toBe(
      "saved",
    );
    expect(find(id).parts.map((p) => [p.categoryId, p.amount])).toEqual([
      [rent, -700],
      [null, -300],
    ]);
    expect(splitRows()).toHaveLength(2);
  });

  it("is made whole by sorting it into one place", () => {
    const id = add({ place: parts([groceries, -600], [rent, -400]) });
    expect(sortTransaction(db, id, rent)).toBe("sorted");
    expect(find(id)).toMatchObject({ categoryId: rent, parts: [] });
    expect(splitRows()).toEqual([]);
    const other = add({ place: parts([groceries, -600], [rent, -400]) });
    sortTransaction(db, other, "unsorted");
    expect(find(other)).toMatchObject({ toSort: true, parts: [] });
  });

  it("can be made from a whole transaction", () => {
    const id = add();
    expect(editTransaction(db, id, input({ place: parts([groceries, -600], [rent, -400]) }))).toBe(
      "saved",
    );
    expect(find(id)).toMatchObject({ categoryId: null, toSort: false });
    expect(find(id).parts).toHaveLength(2);
  });

  it("loses its parts when the transaction is deleted", () => {
    const id = add({ place: parts([groceries, -600], [rent, -400]) });
    add({ place: parts([groceries, -600], [rent, -400]) });
    expect(splitRows()).toHaveLength(4);
    expect(deleteTransaction(db, id)).toBe("deleted");
    expect(splitRows()).toHaveLength(2);
  });

  it("loses its parts when its account is deleted", () => {
    add({ place: parts([groceries, -600], [rent, -400]) });
    expect(deleteAccount(db, checking)).toBe(true);
    expect(splitRows()).toEqual([]);
  });
});

describe("filtering split transactions", () => {
  let rent: number;
  let fun: number;
  let wholeGroceries: number;
  let splitId: number;

  beforeEach(() => {
    rent = createCategory(db, "Rent", createGroup(db, "Home"));
    fun = createCategory(db, "Fun", createGroup(db, "Free"));
    wholeGroceries = add({ amount: -500 });
    splitId = add({
      amount: -3_000,
      place: [
        { categoryId: groceries, amount: -2_000 },
        { categoryId: rent, amount: -1_000 },
      ],
    });
  });

  const ids = (category: number | "none") =>
    listTransactions(db, { filter: { category }, limit: 50 }).map((t) => t.id);

  it("shows a split by a category one of its parts is in", () => {
    expect(ids(rent)).toEqual([splitId]);
    expect(ids(groceries).sort()).toEqual([wholeGroceries, splitId].sort());
  });

  it("does not show a split for a category none of its parts is in", () => {
    expect(ids(fun)).toEqual([]);
  });

  it("counts only the matching part's amount with a category filter", () => {
    expect(summarizeTransactions(db, { category: rent })).toEqual({
      count: 1,
      moneyIn: 0,
      moneyOut: -1_000,
    });
    expect(summarizeTransactions(db, { category: groceries })).toEqual({
      count: 2,
      moneyIn: 0,
      moneyOut: -2_500,
    });
  });

  it("counts only the matching part, with its sign, when parts differ in sign", () => {
    add({
      amount: -1_000,
      place: [
        { categoryId: fun, amount: -1_500 },
        { categoryId: rent, amount: 500 },
      ],
    });
    expect(summarizeTransactions(db, { category: rent })).toEqual({
      count: 2,
      moneyIn: 500,
      moneyOut: -1_000,
    });
  });

  it("counts the whole amount without a category filter", () => {
    expect(summarizeTransactions(db, {})).toMatchObject({ count: 3, moneyIn: 0, moneyOut: -3_500 });
  });

  describe("none", () => {
    let readyId: number;
    let noneSplit: number;
    let unsorted: number;

    beforeEach(() => {
      readyId = add({ amount: -700, place: "ready" });
      unsorted = add({ amount: -100, place: "unsorted" });
      noneSplit = add({
        amount: -1_200,
        place: [
          { categoryId: null, amount: -200 },
          { categoryId: fun, amount: -1_000 },
        ],
      });
    });

    it("shows whole transactions without category and splits with a part in none", () => {
      const shown = ids("none");
      expect(shown.sort()).toEqual([readyId, unsorted, noneSplit].sort());
    });

    it("does not show starting balances or splits with every part in a category", () => {
      const shown = listTransactions(db, { filter: { category: "none" }, limit: 50 });
      expect(shown.some((t) => t.starting)).toBe(false);
      expect(shown.map((t) => t.id)).not.toContain(splitId);
    });

    it("counts only the part without category in the summary", () => {
      expect(summarizeTransactions(db, { category: "none" })).toEqual({
        count: 3,
        moneyIn: 0,
        moneyOut: -700 - 100 - 200,
      });
    });
  });
});

describe("suggesting for split transactions", () => {
  it("suggests nothing when the latest sorted transaction of the payee is split", () => {
    const rent = createCategory(db, "Rent", createGroup(db, "Home"));
    add({ date: "2026-11-01", payee: "Shop", place: groceries });
    add({
      date: "2026-11-02",
      payee: "Shop",
      place: [
        { categoryId: groceries, amount: -600 },
        { categoryId: rent, amount: -400 },
      ],
    });
    expect(suggestCategories(db, ["Shop"]).size).toBe(0);
  });

  it("suggests as before when a whole transaction came after a split", () => {
    const rent = createCategory(db, "Rent", createGroup(db, "Home"));
    add({
      date: "2026-11-01",
      payee: "Shop",
      place: [
        { categoryId: groceries, amount: -600 },
        { categoryId: rent, amount: -400 },
      ],
    });
    add({ date: "2026-11-02", payee: "Shop", place: rent });
    expect(suggestCategories(db, ["Shop"]).get("Shop")).toEqual({
      categoryId: rent,
      category: "Rent",
    });
  });
});
