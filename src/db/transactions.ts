import { createHash } from "node:crypto";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { addMonths, monthStart, type IsoDate } from "../lib/dates";
import type { Cursor, TransactionFilter } from "../lib/transactions-address";
import { UNGROUPED } from "./budget";
import type { Db } from "./index";
import { accounts, categories, categoryGroups, deletedImports, transactions } from "./schema";

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

/**
 * Adds a bank file's rows to an account. Rows that were imported before are
 * skipped, and so are rows that were deleted by hand, so files may overlap.
 * New rows are marked "to sort". Returns null,
 * and changes nothing, when the account does not exist or is archived.
 */
export function importTransactions(
  db: Db,
  accountId: number,
  rows: ImportRow[],
  batch: string,
): { imported: number; duplicates: number } | null {
  return db.transaction((tx) => {
    const account = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.archived, false)))
      .all();
    if (account.length === 0) return null;

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

    // Rows deleted by hand stay deleted, however often the file comes in.
    const deleted = new Set(
      tx
        .select({ importId: deletedImports.importId })
        .from(deletedImports)
        .where(eq(deletedImports.accountId, accountId))
        .all()
        .map((entry) => entry.importId),
    );

    const seen = new Map<string, number>();
    let imported = 0;
    for (const row of rows) {
      const occurrence = (seen.get(row.raw) ?? 0) + 1;
      seen.set(row.raw, occurrence);
      const importId = fingerprint(row.raw, occurrence);
      if (deleted.has(importId)) continue;
      imported += insert.run({
        date: row.date,
        amount: row.amount,
        payee: row.payee,
        note: row.note,
        importId,
      }).changes;
    }
    return { imported, duplicates: rows.length - imported };
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

    const removed = tx
      .delete(transactions)
      .where(eq(transactions.importBatch, batch))
      .run().changes;
    return { removed, sorted: 0 };
  });
}

export type TransactionRow = {
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
  /** The account's "Starting balance" row, which is not sorted into a category. */
  starting: boolean;
};

/** Escapes what LIKE treats as a wildcard, so a search for "50%" finds "50%". */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

function filterConditions(filter: TransactionFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.q) {
    const pattern = likePattern(filter.q);
    // LIKE ignores case for plain letters (A-Z) only; accented letters match exactly.
    conditions.push(
      sql`(${transactions.payee} LIKE ${pattern} ESCAPE '\\' OR ${transactions.note} LIKE ${pattern} ESCAPE '\\')`,
    );
  }
  if (filter.accountId !== undefined) conditions.push(eq(transactions.accountId, filter.accountId));
  if (filter.category === "none") {
    conditions.push(sql`${transactions.categoryId} IS NULL AND ${transactions.starting} = 0`);
  } else if (filter.category !== undefined) {
    conditions.push(eq(transactions.categoryId, filter.category));
  }
  if (filter.month) {
    conditions.push(
      sql`${transactions.date} >= ${monthStart(filter.month)} AND ${transactions.date} < ${monthStart(addMonths(filter.month, 1))}`,
    );
  }
  return conditions;
}

/**
 * One page of transactions, newest first. `before` continues after the last
 * row of the previous page: a position in the list is stable where a page
 * number is not, as new imports arrive at the top.
 */
export function listTransactions(
  db: Db,
  options: { only?: "to-sort"; before?: Cursor; filter?: TransactionFilter; limit: number },
): TransactionRow[] {
  const conditions = filterConditions(options.filter ?? {});
  if (options.only === "to-sort") conditions.push(eq(transactions.toSort, true));
  if (options.before) {
    conditions.push(
      sql`(${transactions.date}, ${transactions.id}) < (${options.before.date}, ${options.before.id})`,
    );
  }
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
      starting: transactions.starting,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(options.limit)
    .all();
}

/**
 * How many transactions match, and the money in and out of all of them (not
 * only one page). Starting balances count as rows but not as money in: they
 * are what an account held, not something that came in.
 */
export function summarizeTransactions(
  db: Db,
  filter: TransactionFilter,
): { count: number; moneyIn: number; moneyOut: number } {
  const [row] = db
    .select({
      count: sql<number>`count(*)`,
      moneyIn: sql<number>`coalesce(sum(CASE WHEN ${transactions.amount} > 0 AND ${transactions.starting} = 0 THEN ${transactions.amount} END), 0)`,
      moneyOut: sql<number>`coalesce(sum(CASE WHEN ${transactions.amount} < 0 AND ${transactions.starting} = 0 THEN ${transactions.amount} END), 0)`,
    })
    .from(transactions)
    .where(and(...filterConditions(filter)))
    .all();
  return row;
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

/** Where the transaction with this payee was sorted last: a category, or none on purpose. */
export type Suggestion = { categoryId: number | null; category: string | null };

/**
 * For each of these payees, where the latest sorted transaction with the same
 * payee (ignoring case and surrounding spaces) went, keyed by the payee as it
 * was given. Nothing is suggested when that category has since been archived.
 * One query for all payees, so a whole page costs one read.
 */
export function suggestCategories(db: Db, payees: string[]): Map<string, Suggestion> {
  const wanted = [...new Set(payees)];
  if (wanted.length === 0) return new Map();
  // "Latest" is the newest by date: nothing records when a row was sorted.
  const found = db.all<{ payee: string; category_id: number | null; name: string | null }>(sql`
    SELECT wanted.value AS payee, last.category_id, categories.name
    FROM (SELECT DISTINCT value FROM json_each(${JSON.stringify(wanted)})) AS wanted
    JOIN (
      SELECT
        lower(trim(payee)) AS key,
        category_id,
        row_number() OVER (
          PARTITION BY lower(trim(payee)) ORDER BY date DESC, id DESC
        ) AS rank
      FROM transactions
      WHERE to_sort = 0 AND starting = 0 AND payee IS NOT NULL
        AND lower(trim(payee)) IN (SELECT lower(trim(value)) FROM json_each(${JSON.stringify(wanted)}))
    ) AS last ON last.key = lower(trim(wanted.value)) AND last.rank = 1
    LEFT JOIN categories ON categories.id = last.category_id
    WHERE last.category_id IS NULL OR categories.archived = 0
  `);
  return new Map(
    found.map((row) => [row.payee, { categoryId: row.category_id, category: row.name }]),
  );
}

/**
 * Where a transaction belongs:
 * - a category id: spending from (or a refund into) that category
 * - "ready": no category, on purpose. Income, or a transfer between accounts.
 * - "unsorted": not decided yet; it goes back to the "to sort" list.
 */
export type SortTarget = number | "ready" | "unsorted";

/** What came of sorting: it worked, or what was missing. */
export type SortResult = "sorted" | "no-transaction" | "no-category";

export function sortTransaction(db: Db, id: number, target: SortTarget): SortResult {
  const exists = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.id, id))
    .all();
  if (exists.length === 0) return "no-transaction";
  if (typeof target === "number") {
    const category = db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, target), eq(categories.archived, false)))
      .all();
    if (category.length === 0) return "no-category";
  }
  db.update(transactions)
    .set({
      categoryId: typeof target === "number" ? target : null,
      toSort: target === "unsorted",
    })
    .where(eq(transactions.id, id))
    .run();
  return "sorted";
}

/**
 * Deletes one transaction. An imported one is remembered, so importing the
 * same bank file again does not bring it back. A starting balance is not
 * deleted: it belongs to its account.
 *
 * The account's starting balance has to be worked out again after this,
 * since it depends on the transactions before its date: call that here.
 */
export function deleteTransaction(db: Db, id: number): "deleted" | "no-transaction" | "starting" {
  return db.transaction((tx) => {
    const [found] = tx
      .select({
        accountId: transactions.accountId,
        importId: transactions.importId,
        starting: transactions.starting,
      })
      .from(transactions)
      .where(eq(transactions.id, id))
      .all();
    if (!found) return "no-transaction";
    if (found.starting) return "starting";

    if (found.importId !== null) {
      tx.insert(deletedImports)
        .values({ accountId: found.accountId, importId: found.importId })
        .onConflictDoNothing()
        .run();
    }
    tx.delete(transactions).where(eq(transactions.id, id)).run();
    return "deleted";
  });
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

/** What the "All" list can be narrowed to: every account, and every category even if archived. */
export function getFilterOptions(db: Db): {
  accounts: { id: number; name: string }[];
  categories: { id: number; name: string; archived: boolean }[];
} {
  return {
    accounts: db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .orderBy(accounts.name)
      .all(),
    categories: db
      .select({ id: categories.id, name: categories.name, archived: categories.archived })
      .from(categories)
      .orderBy(categories.archived, categories.name)
      .all(),
  };
}

export type ImportAccount = { id: number; name: string; importMapping: string | null };

export function getImportAccounts(db: Db): ImportAccount[] {
  return db
    .select({ id: accounts.id, name: accounts.name, importMapping: accounts.importMapping })
    .from(accounts)
    .where(eq(accounts.archived, false))
    .orderBy(accounts.name)
    .all();
}

export function saveImportMapping(db: Db, accountId: number, mapping: string): void {
  db.update(accounts).set({ importMapping: mapping }).where(eq(accounts.id, accountId)).run();
}
