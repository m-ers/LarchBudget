import { and, asc, eq, lte, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { IsoDate } from "../lib/dates";
import {
  closeAccount,
  createAccount,
  deleteAccount,
  getAccounts,
  getClosedAccounts,
  renameAccount,
  reopenAccount,
  setAccountBalance,
  setAccountType,
  syncStartingBalance,
} from "./accounts";
import * as budget from "./budget";
import { getBudgetMonth, setAssigned } from "./budget";
import { created } from "./created";
import { openDb, type Db } from "./index";
import { accounts, deletedImports, transactions } from "./schema";
import {
  countTransactions,
  deleteTransaction,
  getImportAccounts,
  importTransactions,
  listTransactions,
  sortTransaction,
  undoImport,
  type ImportRow,
} from "./transactions";

let db: Db;

/** A row as a bank file would hold it: the raw line is what identifies it. */
const row = (date: IsoDate, amount: number, payee: string): ImportRow => ({
  date,
  amount,
  payee,
  note: null,
  raw: [date, payee, amount].join(";"),
});

/**
 * The bank file of issue #14 (e2e/files/ing.csv): November up to the 18th,
 * 2,850.00 in and 1,244.10 out. The bank showed these balances after each
 * day: 3,199.00 (1st), 2,099.00 (2nd), 2,007.00 (15th), 2,000.00 (17th) and
 * 1,954.90 (18th).
 */
const november: ImportRow[] = [
  row("2026-11-18", -4_510, "Fresh Market"),
  row("2026-11-17", -350, "Coffee Bar"),
  row("2026-11-17", -350, "Coffee Bar"),
  row("2026-11-15", -9_200, "Power & Water Co"),
  row("2026-11-02", -110_000, "Landlord"),
  row("2026-11-01", 285_000, "Acme Corp"),
];

/** The next file, which overlaps (e2e/files/ing-overlap.csv): after the 19th the bank showed 1,948.10. */
const novemberOverlap: ImportRow[] = [row("2026-11-19", -680, "Bakery"), ...november.slice(0, 3)];

/** Older history: October, imported after November. */
const october: ImportRow[] = [
  row("2026-10-28", -6_000, "Fresh Market"),
  row("2026-10-02", -110_000, "Landlord"),
  row("2026-10-01", 285_000, "Acme Corp"),
];

const addAccount = (startingBalance: number, balanceDate: IsoDate, name = "Checking") =>
  created(createAccount(db, { name, type: "checking", startingBalance, balanceDate }));

/** What the account holds now, counting every transaction. */
const balance = (accountId: number) => getAccounts(db).find((a) => a.id === accountId)!.balance;

/** What the account held at the end of a day. */
function balanceAt(accountId: number, date: IsoDate): number {
  const [{ total }] = db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.mapWith(Number) })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), lte(transactions.date, date)))
    .all();
  return total;
}

/** The account's starting balance transaction, if it has one. */
function startingRow(accountId: number) {
  const rows = db
    .select({ date: transactions.date, amount: transactions.amount, payee: transactions.payee })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), eq(transactions.starting, true)))
    .all();
  expect(rows.length).toBeLessThanOrEqual(1);
  return rows[0];
}

/** Every transaction, without ids, in a fixed order: to compare the ledger before and after. */
const ledger = () =>
  db
    .select({
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      date: transactions.date,
      amount: transactions.amount,
      payee: transactions.payee,
      starting: transactions.starting,
      toSort: transactions.toSort,
    })
    .from(transactions)
    .orderBy(
      asc(transactions.accountId),
      asc(transactions.date),
      asc(transactions.amount),
      asc(transactions.payee),
    )
    .all();

/** money in accounts = ready to assign + all-time balance of every category */
function expectEverythingAccountedFor() {
  const farFuture = getBudgetMonth(db, "2999-12");
  const inAccounts = getAccounts(db).reduce((sum, a) => sum + a.balance, 0);
  expect(farFuture.readyToAssign + farFuture.totals.available).toBe(inAccounts);
}

beforeEach(() => {
  db = openDb(":memory:");
});

describe("accounts", () => {
  it("are listed with what they hold, what was entered and how many transactions they have", () => {
    const checking = addAccount(100_000, "2026-10-01");
    importTransactions(
      db,
      checking,
      [row("2026-10-03", -2_500, "Bakery"), row("2026-09-30", 1_000, "Refund")],
      "a",
    );
    expect(getAccounts(db)).toEqual([
      {
        id: checking,
        name: "Checking",
        type: "checking",
        balance: 97_500,
        startingBalance: 100_000,
        balanceDate: "2026-10-01",
        transactionCount: 2,
      },
    ]);
  });

  it("cannot share a name with another open account, ignoring case", () => {
    const checking = addAccount(0, "2026-11-01", "Checking");
    const savings = addAccount(0, "2026-11-01", "Savings");
    expect(
      createAccount(db, {
        name: "CHECKING",
        type: "checking",
        startingBalance: 0,
        balanceDate: "2026-11-01",
      }),
    ).toBe("name-taken");
    expect(renameAccount(db, savings, "checking")).toBe("name-taken");
    expect(renameAccount(db, checking, "checking")).toBe("done");
    expect(getAccounts(db).find((a) => a.id === checking)?.name).toBe("checking");

    // Also beyond plain English letters; an accent makes another name.
    addAccount(0, "2026-11-01", "Épargne");
    expect(renameAccount(db, savings, "ÉPARGNE")).toBe("name-taken");
    expect(renameAccount(db, savings, "Epargne")).toBe("done");
  });

  it("are listed alphabetically, ignoring case, here and on the import page", () => {
    for (const name of ["savings", "Visa", "Checking", "Épargne", "cash"]) {
      addAccount(0, "2026-11-01", name);
    }
    const sorted = ["cash", "Checking", "Épargne", "savings", "Visa"];
    expect(getAccounts(db).map((a) => a.name)).toEqual(sorted);
    expect(getImportAccounts(db).map((a) => a.name)).toEqual(sorted);

    for (const account of getAccounts(db)) closeAccount(db, account.id);
    expect(getClosedAccounts(db).map((a) => a.name)).toEqual(sorted);
  });

  it("can change type", () => {
    const card = addAccount(-25_000, "2026-11-01", "Visa");
    setAccountType(db, card, "credit");
    expect(getAccounts(db)[0]).toMatchObject({ name: "Visa", type: "credit", balance: -25_000 });
  });
});

describe("changing an account's balance", () => {
  it("moves its starting balance so the account holds the new amount on the new day", () => {
    const checking = addAccount(195_490, "2026-11-20");
    importTransactions(db, checking, november, "a");
    importTransactions(db, checking, [row("2026-11-19", -680, "Bakery")], "b");
    expect(balance(checking)).toBe(195_490);

    // The balance was in fact from the 18th, before the bakery.
    expect(
      setAccountBalance(db, checking, { startingBalance: 195_490, balanceDate: "2026-11-18" }),
    ).toBe(true);
    expect(balanceAt(checking, "2026-11-18")).toBe(195_490);
    expect(balance(checking)).toBe(194_810);
    expect(startingRow(checking)).toMatchObject({ date: "2026-10-31", amount: 34_900 });
    expect(getAccounts(db)[0]).toMatchObject({
      startingBalance: 195_490,
      balanceDate: "2026-11-18",
    });
    expectEverythingAccountedFor();

    // A new amount on a later day.
    setAccountBalance(db, checking, { startingBalance: 200_000, balanceDate: "2026-11-25" });
    expect(balance(checking)).toBe(200_000);
    expect(balanceAt(checking, "2026-11-18")).toBe(200_680);
    expectEverythingAccountedFor();
  });

  it("to 0, without history, leaves no starting balance", () => {
    const cash = addAccount(5_000, "2026-11-20", "Cash");
    setAccountBalance(db, cash, { startingBalance: 0, balanceDate: "2026-11-20" });
    expect(startingRow(cash)).toBeUndefined();
    expect(balance(cash)).toBe(0);
  });

  it("is refused for an account that is closed or does not exist", () => {
    const cash = addAccount(0, "2026-11-20", "Cash");
    closeAccount(db, cash);
    const change = { startingBalance: 5_000, balanceDate: "2026-11-20" } as const;
    expect(setAccountBalance(db, cash, change)).toBe(false);
    expect(setAccountBalance(db, 9999, change)).toBe(false);
    expect(startingRow(cash)).toBeUndefined();
  });
});

describe("closing an account", () => {
  it("needs it to hold nothing", () => {
    const savings = addAccount(500_000, "2026-11-01", "Savings");
    expect(closeAccount(db, savings)).toBe("not-empty");
    expect(getAccounts(db)).toHaveLength(1);
    expect(getClosedAccounts(db)).toEqual([]);
  });

  it("takes it off the list and the import page, and keeps its history", () => {
    const savings = addAccount(500_000, "2026-11-01", "Savings");
    // The money moved out, as the bank file shows.
    importTransactions(db, savings, [row("2026-11-10", -500_000, "To checking")], "a");
    expect(closeAccount(db, savings)).toBe("closed");

    expect(getAccounts(db)).toEqual([]);
    expect(getImportAccounts(db)).toEqual([]);
    expect(getClosedAccounts(db)).toEqual([{ id: savings, name: "Savings" }]);
    expect(countTransactions(db).all).toBe(2);
    expect(importTransactions(db, savings, november, "b")).toBeNull();
    // Someone who closed their last account has still started their budget.
    expect(getBudgetMonth(db, "2026-11").hasAccounts).toBe(true);
    expectEverythingAccountedFor();
  });

  it("says when the account does not exist", () => {
    expect(closeAccount(db, 9999)).toBe("gone");
    expect(reopenAccount(db, 9999)).toBe("gone");
    expect(renameAccount(db, 9999, "Ghost")).toBe("gone");
    expect(setAccountType(db, 9999, "cash")).toBe(false);
    expect(deleteAccount(db, 9999)).toBe(false);
  });

  it("keeps holding nothing: its transactions cannot be deleted or un-imported", () => {
    const card = addAccount(0, "2026-10-31", "Visa");
    importTransactions(
      db,
      card,
      [row("2026-11-03", -1_000, "Shop"), row("2026-11-05", 1_000, "Refund")],
      "a",
    );
    expect(closeAccount(db, card)).toBe("closed");

    const refund = listTransactions(db, { limit: 50 }).find((t) => t.payee === "Refund")!;
    expect(deleteTransaction(db, refund.id)).toBe("closed");
    expect(undoImport(db, "a")).toEqual({ removed: 0, sorted: 0, closed: true });
    expect(ledger().filter((t) => t.accountId === card)).toHaveLength(2);

    // Reopened, both work again.
    reopenAccount(db, card);
    expect(deleteTransaction(db, refund.id)).toBe("deleted");
  });

  it("can be undone by reopening it, unless an open account has its name by then", () => {
    const cash = addAccount(0, "2026-11-01", "Cash");
    closeAccount(db, cash);
    // A closed account's name is free.
    const other = addAccount(0, "2026-11-01", "cash");
    expect(reopenAccount(db, cash)).toBe("name-taken");
    expect(getClosedAccounts(db)).toHaveLength(1);

    renameAccount(db, other, "Wallet");
    expect(reopenAccount(db, cash)).toBe("done");
    expect(getAccounts(db).map((a) => a.name)).toEqual(["Cash", "Wallet"]);
    expect(getClosedAccounts(db)).toEqual([]);
  });
});

describe("deleting an account", () => {
  it("removes it with all its transactions, also from the categories", () => {
    const everyday = created(budget.createGroup(db, "Everyday"));
    const groceries = created(budget.createCategory(db, "Groceries", everyday));
    const checking = addAccount(100_000, "2026-10-31");
    const card = addAccount(-20_000, "2026-10-31", "Visa");
    setAssigned(db, groceries, "2026-11", 30_000);
    importTransactions(db, card, [row("2026-11-03", -4_510, "Fresh Market")], "a");
    const market = listTransactions(db, { limit: 50 }).find((t) => t.payee === "Fresh Market")!;
    sortTransaction(db, market.id, groceries);
    db.insert(deletedImports).values({ accountId: card, importId: "gone:1" }).run();
    expect(getBudgetMonth(db, "2026-11").totals.available).toBe(30_000 - 4_510);

    deleteAccount(db, card);
    expect(getAccounts(db).map((a) => a.id)).toEqual([checking]);
    expect(getClosedAccounts(db)).toEqual([]);
    expect(ledger().map((t) => t.accountId)).toEqual([checking]);
    expect(db.select().from(deletedImports).all()).toEqual([]);
    expect(getBudgetMonth(db, "2026-11").totals.available).toBe(30_000);
    expectEverythingAccountedFor();
  });

  it("lets the same bank file be imported again into a new account", () => {
    const checking = addAccount(195_490, "2026-11-20");
    importTransactions(db, checking, november, "a");
    deleteAccount(db, checking);
    const again = addAccount(195_490, "2026-11-20");
    expect(importTransactions(db, again, november, "b")?.imported).toBe(6);
    expect(balance(again)).toBe(195_490);
  });
});

describe("an account's entered balance", () => {
  it("is what the account holds at the end of that day", () => {
    const checking = addAccount(195_490, "2026-11-20");
    expect(balance(checking)).toBe(195_490);
    expect(startingRow(checking)).toEqual({
      date: "2026-11-20",
      amount: 195_490,
      payee: "Starting balance",
    });
    // It is not something to sort.
    expect(listTransactions(db, { only: "to-sort", limit: 50 })).toEqual([]);
    expectEverythingAccountedFor();
  });

  it("is not counted twice when this month's history is imported (issue #14)", () => {
    const checking = addAccount(195_490, "2026-11-20");
    const result = importTransactions(db, checking, november, "a");
    expect(result).toEqual({
      imported: 6,
      duplicates: 0,
      beforeBalance: 6,
      startingBalance: 195_490,
      balanceDate: "2026-11-20",
    });

    // Not 3,560.80: the history was filled in behind the balance.
    expect(balance(checking)).toBe(195_490);
    expect(startingRow(checking)).toEqual({
      date: "2026-10-31",
      amount: 34_900,
      payee: "Starting balance",
    });
    // And every day in between holds what the bank said it did.
    expect(
      (["2026-11-01", "2026-11-02", "2026-11-15", "2026-11-17", "2026-11-18"] as const).map(
        (date) => balanceAt(checking, date),
      ),
    ).toEqual([319_900, 209_900, 200_700, 200_000, 195_490]);
    expect(getBudgetMonth(db, "2026-11").readyToAssign).toBe(195_490);
    expectEverythingAccountedFor();
  });

  it("stays the same when even older history is imported later", () => {
    const checking = addAccount(195_490, "2026-11-20");
    importTransactions(db, checking, november, "a");
    expect(importTransactions(db, checking, october, "b")?.beforeBalance).toBe(3);

    expect(balance(checking)).toBe(195_490);
    expect(balanceAt(checking, "2026-11-01")).toBe(319_900);
    expect(startingRow(checking)).toEqual({
      date: "2026-09-30",
      amount: 34_900 - 285_000 + 110_000 + 6_000,
      payee: "Starting balance",
    });
    expectEverythingAccountedFor();
  });

  it("does not change when the same file is imported again", () => {
    const checking = addAccount(195_490, "2026-11-20");
    importTransactions(db, checking, november, "a");
    const before = ledger();
    expect(importTransactions(db, checking, november, "b")).toMatchObject({
      imported: 0,
      duplicates: 6,
      beforeBalance: 0,
    });
    expect(ledger()).toEqual(before);
  });

  it("has rows from after its date added on top", () => {
    const checking = addAccount(195_490, "2026-11-18");
    importTransactions(db, checking, november, "a");
    expect(balance(checking)).toBe(195_490);

    const later = [row("2026-11-19", -680, "Bakery"), row("2026-11-25", 5_000, "Refund")];
    expect(importTransactions(db, checking, later, "b")?.beforeBalance).toBe(0);
    expect(balance(checking)).toBe(195_490 - 680 + 5_000);
    expect(balanceAt(checking, "2026-11-18")).toBe(195_490);
    expect(startingRow(checking)?.amount).toBe(34_900);
    expectEverythingAccountedFor();
  });

  it("counts a row dated on the balance date as part of that balance", () => {
    const checking = addAccount(100_000, "2026-11-18");
    const result = importTransactions(
      db,
      checking,
      [row("2026-11-18", -4_510, "Fresh Market"), row("2026-11-19", -680, "Bakery")],
      "a",
    );
    expect(result?.beforeBalance).toBe(1);
    expect(balanceAt(checking, "2026-11-18")).toBe(100_000);
    expect(balance(checking)).toBe(100_000 - 680);
  });

  it("is restored exactly when an import is undone", () => {
    const checking = addAccount(195_490, "2026-11-20");
    const empty = ledger();

    importTransactions(db, checking, november, "a");
    const afterNovember = ledger();
    importTransactions(db, checking, october, "b");
    importTransactions(db, checking, [row("2026-11-21", -1_000, "Bakery")], "c");

    // Undoing the newest rows takes them off the top again.
    expect(undoImport(db, "c")).toMatchObject({ removed: 1, sorted: 0 });
    expect(balance(checking)).toBe(195_490);

    // Undoing older history moves the starting balance back.
    expect(undoImport(db, "b")).toMatchObject({ removed: 3, sorted: 0 });
    expect(ledger()).toEqual(afterNovember);

    expect(undoImport(db, "a")).toMatchObject({ removed: 6, sorted: 0 });
    expect(ledger()).toEqual(empty);
    expectEverythingAccountedFor();
  });

  it("copes with files that overlap", () => {
    const checking = addAccount(194_810, "2026-11-20");
    importTransactions(db, checking, november, "a");
    expect(importTransactions(db, checking, novemberOverlap, "b")).toMatchObject({
      imported: 1,
      duplicates: 3,
      beforeBalance: 1,
    });

    expect(balance(checking)).toBe(194_810);
    expect(balanceAt(checking, "2026-11-18")).toBe(195_490);
    expect(balanceAt(checking, "2026-11-01")).toBe(319_900);

    // A file that reaches past the balance date adds only its newer rows on top.
    const reachingPast = [row("2026-11-22", -2_000, "Bakery"), ...novemberOverlap];
    expect(importTransactions(db, checking, reachingPast, "c")).toMatchObject({
      imported: 1,
      duplicates: 4,
      beforeBalance: 0,
    });
    expect(balance(checking)).toBe(192_810);
    expectEverythingAccountedFor();
  });

  it("of 0 needs no starting balance until history is filled in behind it", () => {
    const cash = addAccount(0, "2026-11-20", "Cash");
    expect(startingRow(cash)).toBeUndefined();
    expect(balance(cash)).toBe(0);

    importTransactions(db, cash, november, "a");
    expect(balance(cash)).toBe(0);
    expect(startingRow(cash)).toEqual({
      date: "2026-10-31",
      amount: -(285_000 - 124_410),
      payee: "Starting balance",
    });
    expectEverythingAccountedFor();

    undoImport(db, "a");
    expect(startingRow(cash)).toBeUndefined();

    // Rows after the date need no starting balance either.
    importTransactions(db, cash, [row("2026-11-21", 2_000, "Found in a coat")], "b");
    expect(startingRow(cash)).toBeUndefined();
    expect(balance(cash)).toBe(2_000);
    expectEverythingAccountedFor();
  });

  it("is removed when the history explains all of it, and comes back when needed", () => {
    const checking = addAccount(285_000, "2026-11-01");
    importTransactions(db, checking, [row("2026-11-01", 285_000, "Acme Corp")], "a");
    expect(startingRow(checking)).toBeUndefined();
    expect(balance(checking)).toBe(285_000);

    importTransactions(db, checking, [row("2026-10-30", -1_000, "Bakery")], "b");
    expect(startingRow(checking)).toEqual({
      date: "2026-10-29",
      amount: 1_000,
      payee: "Starting balance",
    });
    expect(balance(checking)).toBe(285_000);

    undoImport(db, "b");
    expect(startingRow(checking)).toBeUndefined();
    expectEverythingAccountedFor();
  });

  it("keeps everything accounted for while that history is sorted into categories", () => {
    const everyday = created(budget.createGroup(db, "Everyday"));
    const groceries = created(budget.createCategory(db, "Groceries", everyday));
    const rent = created(budget.createCategory(db, "Rent", everyday));
    const checking = addAccount(195_490, "2026-11-20");
    setAssigned(db, groceries, "2026-11", 30_000);
    setAssigned(db, rent, "2026-11", 110_000);
    expectEverythingAccountedFor();

    importTransactions(db, checking, november, "a");
    expect(getBudgetMonth(db, "2026-11").readyToAssign).toBe(195_490 - 140_000);
    expectEverythingAccountedFor();

    const all = listTransactions(db, { limit: 50 });
    sortTransaction(db, all.find((t) => t.payee === "Fresh Market")!.id, groceries);
    sortTransaction(db, all.find((t) => t.payee === "Landlord")!.id, rent);
    sortTransaction(db, all.find((t) => t.payee === "Acme Corp")!.id, "ready");
    expect(balance(checking)).toBe(195_490);
    expectEverythingAccountedFor();

    importTransactions(db, checking, october, "b");
    expectEverythingAccountedFor();
  });

  it("belongs to one account: importing into another leaves it alone", () => {
    const checking = addAccount(195_490, "2026-11-20");
    const savings = addAccount(500_000, "2026-11-01", "Savings");
    importTransactions(db, checking, november, "a");
    expect(startingRow(savings)).toEqual({
      date: "2026-11-01",
      amount: 500_000,
      payee: "Starting balance",
    });
    expect(balance(savings)).toBe(500_000);
  });
});

describe("the starting balance's date", () => {
  /** The starting balance's date for a balance entered on `balanceDate`, after importing rows on `dates`. */
  function startingDate(balanceDate: IsoDate, dates: IsoDate[]): IsoDate | undefined {
    const account = addAccount(100_000, balanceDate, `Account ${getAccounts(db).length + 1}`);
    importTransactions(
      db,
      account,
      dates.map((date, i) => row(date, -100 * (i + 1), "Shop")),
      "a",
    );
    return startingRow(account)?.date;
  }

  it("is the balance date when nothing is older", () => {
    expect(startingDate("2026-11-20", [])).toBe("2026-11-20");
    expect(startingDate("2026-11-20", ["2026-11-21", "2026-12-05"])).toBe("2026-11-20");
  });

  it("is the day before the earliest other transaction when that is earlier", () => {
    expect(startingDate("2026-11-20", ["2026-11-20"])).toBe("2026-11-19");
    expect(startingDate("2026-11-20", ["2026-11-02", "2026-11-25"])).toBe("2026-11-01");
  });

  it("goes back over the start of a month, a year and a leap day", () => {
    expect(startingDate("2026-11-20", ["2026-11-01"])).toBe("2026-10-31");
    expect(startingDate("2026-11-20", ["2026-01-01"])).toBe("2025-12-31");
    expect(startingDate("2026-11-20", ["2024-03-01"])).toBe("2024-02-29");
  });
});

describe("syncing the starting balance", () => {
  it("leaves an account without a balance date alone", () => {
    const { id } = db.insert(accounts).values({ name: "Old", type: "checking" }).returning().get();
    db.insert(transactions)
      .values([
        { accountId: id, date: "2026-10-01", amount: 50_000, payee: "Starting balance" },
        { accountId: id, date: "2026-09-01", amount: -1_000, payee: "Shop" },
      ])
      .run();
    const before = ledger();
    syncStartingBalance(db, id);
    expect(ledger()).toEqual(before);
  });

  it("changes nothing when called again", () => {
    const checking = addAccount(195_490, "2026-11-20");
    importTransactions(db, checking, november, "a");
    const before = ledger();
    syncStartingBalance(db, checking);
    syncStartingBalance(db, checking);
    expect(ledger()).toEqual(before);
  });
});
