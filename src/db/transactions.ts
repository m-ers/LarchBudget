import { createHash } from "node:crypto";
import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { addMonths, monthStart, type IsoDate } from "../lib/dates";
import type { Cursor, TransactionFilter } from "../lib/transactions-address";
import { byName, syncStartingBalance } from "./accounts";
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
 * skipped, and so are rows that were deleted by hand, so files may overlap.
 * New rows are marked "to sort". Returns null,
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
    let beforeBalance = 0;
    for (const row of rows) {
      const occurrence = (seen.get(row.raw) ?? 0) + 1;
      seen.set(row.raw, occurrence);
      const importId = fingerprint(row.raw, occurrence);
      if (deleted.has(importId)) continue;
      const added = insert.run({
        date: row.date,
        amount: row.amount,
        payee: row.payee,
        note: row.note,
        importId,
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
 * nothing is removed. Nothing is removed from an account that was closed
 * since, either (`closed`).
 */
export function undoImport(
  db: Db,
  batch: string,
): { removed: number; sorted: number; closed: boolean } {
  return db.transaction((tx) => {
    const sorted = tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.importBatch, batch), eq(transactions.toSort, false)))
      .all().length;
    if (sorted > 0) return { removed: 0, sorted, closed: false };

    // A closed account holds nothing, and has to keep doing so.
    const closed = tx
      .select({ id: accounts.id })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(and(eq(transactions.importBatch, batch), eq(accounts.archived, true)))
      .limit(1)
      .all();
    if (closed.length > 0) return { removed: 0, sorted: 0, closed: true };

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
    return { removed, sorted: 0, closed: false };
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
 * - a category id: spending from (or a refund into) an expense category, or
 *   money in through an income category
 * - "ready": no category, on purpose. A transfer between accounts, or income
 *   that has no income category.
 * - "unsorted": not decided yet; it goes back to the "to sort" list.
 *
 * An income category and "ready" count the same in the budget: both leave
 * the money in Ready to assign.
 */
export type SortTarget = number | "ready" | "unsorted";

/** What came of sorting: it worked, or why it could not. */
export type SortResult = "sorted" | "no-transaction" | "no-category" | "starting";

export function sortTransaction(db: Db, id: number, target: SortTarget): SortResult {
  const [found] = db
    .select({ starting: transactions.starting })
    .from(transactions)
    .where(eq(transactions.id, id))
    .all();
  if (!found) return "no-transaction";
  // A starting balance is not income or spending: it belongs to no category.
  if (found.starting) return "starting";
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
 * deleted: it belongs to its account. Nor is a transaction of a closed
 * account: reopen the account first.
 *
 * The account's starting balance is then worked out again: it depends on
 * the transactions from before its date, so what the account held on that
 * date stays as its owner entered it.
 */
export function deleteTransaction(
  db: Db,
  id: number,
): "deleted" | "no-transaction" | "starting" | "closed" {
  return db.transaction((tx) => {
    const [found] = tx
      .select({
        accountId: transactions.accountId,
        importId: transactions.importId,
        starting: transactions.starting,
        closed: accounts.archived,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(eq(transactions.id, id))
      .all();
    if (!found) return "no-transaction";
    if (found.starting) return "starting";
    // A closed account holds nothing, and has to keep doing so.
    if (found.closed) return "closed";

    if (found.importId !== null) {
      tx.insert(deletedImports)
        .values({ accountId: found.accountId, importId: found.importId })
        .onConflictDoNothing()
        .run();
    }
    tx.delete(transactions).where(eq(transactions.id, id)).run();
    syncStartingBalance(tx, found.accountId);
    return "deleted";
  });
}

/** Heading for the income categories in the category picker. */
const INCOME = "Income";

export type CategoryOptionGroup = {
  /** The group's id; "income" for the income categories, null for categories without a group. */
  id: number | "income" | null;
  name: string;
  categories: { id: number; name: string }[];
};

/**
 * The categories a transaction can be sorted into, grouped as on the budget
 * page: the income categories first, then the groups.
 */
export function getCategoryOptions(db: Db): CategoryOptionGroup[] {
  const rows = db
    .select({
      id: categories.id,
      name: categories.name,
      income: categories.income,
      groupId: categoryGroups.id,
      group: categoryGroups.name,
    })
    .from(categories)
    // An income category has no group, even in a hand-edited database.
    .leftJoin(
      categoryGroups,
      and(eq(categoryGroups.id, categories.groupId), eq(categories.income, false)),
    )
    .where(eq(categories.archived, false))
    // Income, then groups in their own order, then categories without a group, as on the budget page.
    .orderBy(
      desc(categories.income),
      sql`${categoryGroups.id} IS NULL`,
      categoryGroups.sortOrder,
      categoryGroups.id,
      categories.sortOrder,
      categories.id,
    )
    .all();

  const groups: CategoryOptionGroup[] = [];
  for (const row of rows) {
    const id = row.income ? "income" : row.groupId;
    let group = groups.find((g) => g.id === id);
    if (!group) {
      const name = row.income ? INCOME : (row.group ?? UNGROUPED);
      groups.push((group = { id, name, categories: [] }));
    }
    group.categories.push({ id: row.id, name: row.name });
  }
  return groups;
}

/** What the "All" list can be narrowed to: every account, and every category even if archived. */
export function getFilterOptions(db: Db): {
  accounts: { id: number; name: string; closed: boolean }[];
  categories: { id: number; name: string; archived: boolean }[];
} {
  return {
    // Open accounts first, each part in the order of the Accounts page.
    accounts: db
      .select({ id: accounts.id, name: accounts.name, closed: accounts.archived })
      .from(accounts)
      .all()
      .sort((a, b) => Number(a.closed) - Number(b.closed) || byName(a, b)),
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
    .all()
    .sort(byName);
}

export function saveImportMapping(db: Db, accountId: number, mapping: string): void {
  db.update(accounts).set({ importMapping: mapping }).where(eq(accounts.id, accountId)).run();
}

/**
 * Which rows of a bank file the account has already, as positions in `rows`:
 * rows that an earlier import brought in, and rows that were imported and
 * then deleted by hand, which an import does not bring back. It tells apart
 * identical rows the way `importTransactions` does.
 */
export function findKnownRows(db: Db, accountId: number, rows: { raw: string }[]): number[] {
  if (rows.length === 0) return [];
  const known = new Set<string>([
    ...db
      .select({ importId: transactions.importId })
      .from(transactions)
      .where(and(eq(transactions.accountId, accountId), isNotNull(transactions.importId)))
      .all()
      .map((row) => row.importId!),
    ...db
      .select({ importId: deletedImports.importId })
      .from(deletedImports)
      .where(eq(deletedImports.accountId, accountId))
      .all()
      .map((row) => row.importId),
  ]);

  const seen = new Map<string, number>();
  const found: number[] = [];
  rows.forEach((row, index) => {
    const occurrence = (seen.get(row.raw) ?? 0) + 1;
    seen.set(row.raw, occurrence);
    if (known.has(fingerprint(row.raw, occurrence))) found.push(index);
  });
  return found;
}
