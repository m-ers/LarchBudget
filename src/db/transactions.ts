import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { IsoDate } from "../lib/dates";
import { byName, syncStartingBalance } from "./accounts";
import { UNGROUPED } from "./budget";
import type { Db } from "./index";
import { accounts, categories, categoryGroups, transactions } from "./schema";

/**
 * Importing bank transactions and sorting them into categories.
 *
 * Like `budget.ts`, these functions take the database as an argument and
 * never touch Next.js, so they can be unit tested.
 */

export type ImportRow = {
  date: IsoDate;
  /** Minor units; negative = money out. */
  amount: number;
  payee: string | null;
  note: string | null;
  /**
   * The row exactly as it stands in the bank file. Duplicates are recognised
   * by this, not by the fields above, so reading the file with different
   * column choices never imports a transaction twice.
   */
  raw: string;
};

/**
 * The fingerprint of an imported row. Two identical rows in one file (two
 * coffees on the same day) are told apart by their position among equals.
 */
function fingerprint(raw: string, occurrence: number): string {
  return `${createHash("sha256").update(raw).digest("hex").slice(0, 32)}:${occurrence}`;
}

export type ImportOutcome = {
  imported: number;
  duplicates: number;
  /**
   * How many of the imported rows are dated on or before the account's
   * balance date. They are filled in behind the balance entered for that
   * day, so they do not change what the account holds.
   */
  beforeBalance: number;
  /** The account's entered balance and its date, as they stood for this import. */
  startingBalance: number | null;
  balanceDate: IsoDate | null;
};

/**
 * Adds a bank file's rows to an account. Rows that were imported before are
 * skipped, so files may overlap. New rows are marked "to sort". Returns null,
 * and changes nothing, when the account does not exist or is archived.
 */
export function importTransactions(
  db: Db,
  accountId: number,
  rows: ImportRow[],
  batch: string,
): ImportOutcome | null {
  return db.transaction((tx) => {
    const [account] = tx
      .select({ startingBalance: accounts.startingBalance, balanceDate: accounts.balanceDate })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.archived, false)))
      .all();
    if (!account) return null;
    const { startingBalance, balanceDate } = account;

    // Prepared once and run per row: a file can hold thousands of rows.
    const insert = tx
      .insert(transactions)
      .values({
        accountId,
        date: sql.placeholder("date"),
        amount: sql.placeholder("amount"),
        payee: sql.placeholder("payee"),
        note: sql.placeholder("note"),
        toSort: true,
        importId: sql.placeholder("importId"),
        importBatch: batch,
      })
      .onConflictDoNothing({ target: [transactions.accountId, transactions.importId] })
      .prepare();

    const seen = new Map<string, number>();
    let imported = 0;
    let beforeBalance = 0;
    for (const row of rows) {
      const occurrence = (seen.get(row.raw) ?? 0) + 1;
      seen.set(row.raw, occurrence);
      const added = insert.run({
        date: row.date,
        amount: row.amount,
        payee: row.payee,
        note: row.note,
        importId: fingerprint(row.raw, occurrence),
      }).changes;
      imported += added;
      if (added > 0 && balanceDate !== null && row.date <= balanceDate) beforeBalance += 1;
    }
    syncStartingBalance(tx, accountId);
    return {
      imported,
      duplicates: rows.length - imported,
      beforeBalance,
      startingBalance,
      balanceDate,
    };
  });
}

/**
 * Removes everything one import added, as long as none of it has been sorted
 * yet. Once work has gone into those transactions, `sorted` says how many and
 * nothing is removed.
 */
export function undoImport(db: Db, batch: string): { removed: number; sorted: number } {
  return db.transaction((tx) => {
    const sorted = tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.importBatch, batch), eq(transactions.toSort, false)))
      .all().length;
    if (sorted > 0) return { removed: 0, sorted };

    const affected = tx
      .selectDistinct({ accountId: transactions.accountId })
      .from(transactions)
      .where(eq(transactions.importBatch, batch))
      .all();
    const removed = tx
      .delete(transactions)
      .where(eq(transactions.importBatch, batch))
      .run().changes;
    for (const { accountId } of affected) syncStartingBalance(tx, accountId);
    return { removed, sorted: 0 };
  });
}

type TransactionRow = {
  id: number;
  date: IsoDate;
  amount: number;
  payee: string | null;
  note: string | null;
  account: string;
  categoryId: number | null;
  /** The category's name, also when that category has since been archived. */
  category: string | null;
  categoryArchived: boolean;
  toSort: boolean;
};

export function listTransactions(
  db: Db,
  options: { only?: "to-sort"; limit: number },
): TransactionRow[] {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      payee: transactions.payee,
      note: transactions.note,
      account: accounts.name,
      categoryId: transactions.categoryId,
      category: categories.name,
      categoryArchived: sql<boolean>`coalesce(${categories.archived}, 0)`.mapWith(Boolean),
      toSort: transactions.toSort,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(options.only === "to-sort" ? eq(transactions.toSort, true) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(options.limit)
    .all();
}

export function countTransactions(db: Db): { all: number; toSort: number } {
  // Two counts instead of one pass, so each is answered from an index.
  const [row] = db.all<{ all_count: number; to_sort: number }>(sql`
    SELECT
      (SELECT count(*) FROM transactions) AS all_count,
      (SELECT count(*) FROM transactions WHERE to_sort = 1) AS to_sort
  `);
  return { all: row.all_count, toSort: row.to_sort };
}

/**
 * Where a transaction belongs:
 * - a category id: spending from (or a refund into) that category
 * - "ready": no category, on purpose. Income, or a transfer between accounts.
 * - "unsorted": not decided yet; it goes back to the "to sort" list.
 */
export type SortTarget = number | "ready" | "unsorted";

/** Returns false when the transaction or category does not exist. */
export function sortTransaction(db: Db, id: number, target: SortTarget): boolean {
  if (typeof target === "number") {
    const category = db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, target), eq(categories.archived, false)))
      .all();
    if (category.length === 0) return false;
  }
  const changes = db
    .update(transactions)
    .set({
      categoryId: typeof target === "number" ? target : null,
      toSort: target === "unsorted",
    })
    .where(eq(transactions.id, id))
    .run().changes;
  return changes > 0;
}

export type CategoryOptionGroup = { name: string; categories: { id: number; name: string }[] };

/** The categories a transaction can be sorted into, grouped as on the budget page. */
export function getCategoryOptions(db: Db): CategoryOptionGroup[] {
  const rows = db
    .select({
      id: categories.id,
      name: categories.name,
      group: categoryGroups.name,
    })
    .from(categories)
    .leftJoin(categoryGroups, eq(categoryGroups.id, categories.groupId))
    .where(eq(categories.archived, false))
    // Groups in their own order, then categories without a group, as on the budget page.
    .orderBy(
      sql`${categoryGroups.id} IS NULL`,
      categoryGroups.sortOrder,
      categoryGroups.id,
      categories.sortOrder,
      categories.id,
    )
    .all();

  const groups: CategoryOptionGroup[] = [];
  for (const row of rows) {
    const name = row.group ?? UNGROUPED;
    let group = groups.find((g) => g.name === name);
    if (!group) groups.push((group = { name, categories: [] }));
    group.categories.push({ id: row.id, name: row.name });
  }
  return groups;
}

export type ImportAccount = { id: number; name: string; importMapping: string | null };

export function getImportAccounts(db: Db): ImportAccount[] {
  return db
    .select({ id: accounts.id, name: accounts.name, importMapping: accounts.importMapping })
    .from(accounts)
    .where(eq(accounts.archived, false))
    .all()
    .sort(byName);
}

export function saveImportMapping(db: Db, accountId: number, mapping: string): void {
  db.update(accounts).set({ importMapping: mapping }).where(eq(accounts.id, accountId)).run();
}
