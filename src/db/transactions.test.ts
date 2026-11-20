import { beforeEach, describe, expect, it } from "vitest";
import type { IsoDate } from "../lib/dates";
import { createAccount, getAccounts } from "./accounts";
import * as budget from "./budget";
import { archiveCategory, getBudgetMonth, setAssigned } from "./budget";
import { openDb, type Db } from "./index";
import { created } from "./created";
import {
  countTransactions,
  getCategoryOptions,
  getImportAccounts,
  importTransactions,
  listTransactions,
  saveImportMapping,
  sortTransaction,
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
    balanceDate: "2026-10-31",
  });
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
    const savings = createAccount(db, {
      name: "Savings",
      type: "savings",
      startingBalance: 0,
      balanceDate: "2026-10-31",
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
    expect(importTransactions(db, checking, readDifferently, "b")).toMatchObject({
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
    expect(sortTransaction(db, market, groceries)).toBe(true);

    const budget = getBudgetMonth(db, "2026-11");
    expect(budget.groups[0].categories[0]).toMatchObject({ activity: -4_510, available: 25_490 });
    expect(budget.readyToAssign).toBe(before + 4_510);
    expect(countTransactions(db).toSort).toBe(3);
  });

  it("can mark income as sorted without a category", () => {
    const before = getBudgetMonth(db, "2026-11").readyToAssign;
    expect(sortTransaction(db, salary, "ready")).toBe(true);
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

  it("refuses a category that is archived or does not exist", () => {
    expect(sortTransaction(db, market, 9999)).toBe(false);
    archiveCategory(db, groceries);
    expect(sortTransaction(db, market, groceries)).toBe(false);
    expect(sortTransaction(db, 9999, "ready")).toBe(false);
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
