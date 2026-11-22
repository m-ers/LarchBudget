import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { addMonths, monthStart, type IsoDate, type Month } from "../lib/dates";
import { buildMatcher } from "../lib/rules";
import type { Cursor, TransactionFilter } from "../lib/transactions-address";
import { byName, syncStartingBalance } from "./accounts";
import { UNGROUPED, categoryOpen } from "./budget";
import { usableRules } from "./rules";
import type { Db } from "./index";
import {
  accounts,
  categories,
  categoryGroups,
  deletedImports,
  sortingRules,
  transactionSplits,
  transactions,
} from "./schema";

/**
 * Importing bank transactions, adding and changing them by hand, and
 * sorting them into categories, whole or split.
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
  /** How many of the imported rows a sorting rule sorted at once; the others are still to sort. */
  byRules: number;
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
 * New rows are sorted by the first sorting rule that fits them, and the rest
 * are marked "to sort". Returns null,
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
        categoryId: sql.placeholder("categoryId"),
        // 1 or 0: a placeholder is handed to SQLite as it is, and it takes no boolean.
        toSort: sql.placeholder("toSort"),
        ruleId: sql.placeholder("ruleId"),
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

    const findRule = buildMatcher(usableRules(tx));
    const seen = new Map<string, number>();
    let imported = 0;
    let byRules = 0;
    let beforeBalance = 0;
    for (const row of rows) {
      const occurrence = (seen.get(row.raw) ?? 0) + 1;
      seen.set(row.raw, occurrence);
      const importId = fingerprint(row.raw, occurrence);
      if (deleted.has(importId)) continue;
      const rule = findRule(row.payee, row.note);
      const added = insert.run({
        date: row.date,
        amount: row.amount,
        payee: row.payee,
        note: row.note,
        categoryId: rule?.categoryId ?? null,
        toSort: rule ? 0 : 1,
        ruleId: rule?.id ?? null,
        importId,
      }).changes;
      imported += added;
      if (rule) byRules += added;
      if (added > 0 && balanceDate !== null && row.date <= balanceDate) beforeBalance += 1;
    }
    syncStartingBalance(tx, accountId);
    return {
      imported,
      byRules,
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
 * nothing is removed. What a sorting rule sorted is no work of anyone's, so
 * it does not stop the import from being undone. Nothing is removed from an account that was closed
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
      .where(
        and(
          eq(transactions.importBatch, batch),
          eq(transactions.toSort, false),
          isNull(transactions.ruleId),
        ),
      )
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
  accountId: number;
  categoryId: number | null;
  /** The category's name, also when that category has since been archived. */
  category: string | null;
  categoryArchived: boolean;
  toSort: boolean;
  /** The sorting rule that put it where it is, and that rule's text; null when nobody's rule did. */
  ruleId: number | null;
  rule: string | null;
  /** The account's "Starting balance" row, which is not sorted into a category. */
  starting: boolean;
  /** Came from a bank file: its date and amount stay as the bank has them. */
  imported: boolean;
  /** For a split transaction, its parts in the order they were entered; empty otherwise. */
  parts: SplitPart[];
};

export type SplitPart = {
  /** Null for a part in no category. */
  categoryId: number | null;
  category: string | null;
  categoryArchived: boolean;
  amount: number;
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
  if (filter.category !== undefined) {
    // A split transaction is in a category when one of its parts is.
    const whole =
      filter.category === "none"
        ? sql`${transactions.categoryId} IS NULL AND ${transactions.starting} = 0 AND ${transactions.split} = 0`
        : eq(transactions.categoryId, filter.category);
    conditions.push(
      sql`(${whole} OR (${transactions.split} = 1 AND EXISTS (SELECT 1 FROM ${transactionSplits} s WHERE s.transaction_id = ${transactions.id} AND ${partIn(filter.category)})))`,
    );
  }
  if (filter.month) {
    conditions.push(
      sql`${transactions.date} >= ${monthStart(filter.month)} AND ${transactions.date} < ${monthStart(addMonths(filter.month, 1))}`,
    );
  }
  return conditions;
}

/** Whether split part `s` is in the category a filter asks for ("none": in no category). */
function partIn(category: number | "none"): SQL {
  return category === "none" ? sql`s.category_id IS NULL` : sql`s.category_id = ${category}`;
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
  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      payee: transactions.payee,
      note: transactions.note,
      account: accounts.name,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      category: categories.name,
      categoryArchived: sql<boolean>`coalesce(${categories.archived}, 0)`.mapWith(Boolean),
      toSort: transactions.toSort,
      ruleId: transactions.ruleId,
      rule: sortingRules.text,
      starting: transactions.starting,
      imported: sql<boolean>`${transactions.importId} IS NOT NULL`.mapWith(Boolean),
      split: transactions.split,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(sortingRules, eq(sortingRules.id, transactions.ruleId))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(options.limit)
    .all();

  const parts = getParts(
    db,
    rows.flatMap((row) => (row.split ? [row.id] : [])),
  );
  return rows.map(({ split, ...row }) => ({ ...row, parts: (split && parts.get(row.id)) || [] }));
}

/** The parts of these split transactions, by transaction, in the order they were entered. */
function getParts(db: Db, ids: number[]): Map<number, SplitPart[]> {
  const parts = new Map<number, SplitPart[]>();
  if (ids.length === 0) return parts;
  const rows = db
    .select({
      transactionId: transactionSplits.transactionId,
      categoryId: transactionSplits.categoryId,
      category: categories.name,
      categoryArchived: sql<boolean>`coalesce(${categories.archived}, 0)`.mapWith(Boolean),
      amount: transactionSplits.amount,
    })
    .from(transactionSplits)
    .leftJoin(categories, eq(categories.id, transactionSplits.categoryId))
    .where(inArray(transactionSplits.transactionId, ids))
    .orderBy(transactionSplits.id)
    .all();
  for (const { transactionId, ...part } of rows) {
    parts.set(transactionId, [...(parts.get(transactionId) ?? []), part]);
  }
  return parts;
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
  // Narrowed to a category, a split transaction counts with its part in that category only.
  const amount =
    filter.category === undefined
      ? sql`${transactions.amount}`
      : sql`CASE WHEN ${transactions.split} = 1 THEN (SELECT sum(s.amount) FROM ${transactionSplits} s WHERE s.transaction_id = ${transactions.id} AND ${partIn(filter.category)}) ELSE ${transactions.amount} END`;
  const [row] = db
    .select({
      count: sql<number>`count(*)`,
      moneyIn: sql<number>`coalesce(sum(CASE WHEN ${amount} > 0 AND ${transactions.starting} = 0 THEN ${amount} END), 0)`,
      moneyOut: sql<number>`coalesce(sum(CASE WHEN ${amount} < 0 AND ${transactions.starting} = 0 THEN ${amount} END), 0)`,
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
 * was given. Nothing is suggested when that category has since been archived,
 * or when that transaction was split: one category would not be right.
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
        split,
        row_number() OVER (
          PARTITION BY lower(trim(payee)) ORDER BY date DESC, id DESC
        ) AS rank
      FROM transactions
      WHERE to_sort = 0 AND starting = 0 AND payee IS NOT NULL
        AND lower(trim(payee)) IN (SELECT lower(trim(value)) FROM json_each(${JSON.stringify(wanted)}))
    ) AS last ON last.key = lower(trim(wanted.value)) AND last.rank = 1
    LEFT JOIN categories ON categories.id = last.category_id
    WHERE last.split = 0 AND (last.category_id IS NULL OR categories.archived = 0)
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

/** Sorts a whole transaction into one place. A split transaction stops being split. */
export function sortTransaction(db: Db, id: number, target: SortTarget): SortResult {
  return db.transaction((tx) => {
    const [found] = tx
      .select({ starting: transactions.starting })
      .from(transactions)
      .where(eq(transactions.id, id))
      .all();
    if (!found) return "no-transaction";
    // A starting balance is not income or spending: it belongs to no category.
    if (found.starting) return "starting";
    if (typeof target === "number" && !categoryOpen(tx, target)) return "no-category";
    writePlace(tx, id, target);
    return "sorted";
  });
}

/** Where a transaction goes: one place, or parts. Checked by the caller. */
type Place = SortTarget | NewPart[];

/** A part of a split as it is entered. Null for no category. */
export type NewPart = { categoryId: number | null; amount: number };

/**
 * Puts a transaction in one place, or splits it into parts, replacing any
 * parts it had. It is then someone's choice, no longer a rule's.
 */
function writePlace(db: Db, id: number, place: Place): void {
  db.delete(transactionSplits).where(eq(transactionSplits.transactionId, id)).run();
  if (Array.isArray(place)) {
    db.update(transactions)
      .set({ categoryId: null, toSort: false, split: true, ruleId: null })
      .where(eq(transactions.id, id))
      .run();
    db.insert(transactionSplits)
      .values(place.map((part) => ({ transactionId: id, ...part })))
      .run();
  } else {
    db.update(transactions)
      .set({
        categoryId: typeof place === "number" ? place : null,
        toSort: place === "unsorted",
        split: false,
        ruleId: null,
      })
      .where(eq(transactions.id, id))
      .run();
  }
}

/** The fewest parts a split has. One part is just the category. */
export const MIN_PARTS = 2;

/**
 * Why a place cannot be used for a transaction of `amount`, or null when it
 * can: parts must be at least two, none of them zero, and add up to the
 * amount. Categories must be open, except one the transaction is in already
 * (`kept`), so an archived category can stay where it is.
 */
function checkPlace(
  db: Db,
  place: Place,
  amount: number,
  kept: Set<number>,
): "no-category" | "parts" | null {
  const usable = (id: number | null) => id === null || kept.has(id) || categoryOpen(db, id);
  if (!Array.isArray(place)) {
    return typeof place === "number" && !usable(place) ? "no-category" : null;
  }
  if (place.length < MIN_PARTS || place.some((part) => part.amount === 0)) return "parts";
  if (place.reduce((sum, part) => sum + part.amount, 0) !== amount) return "parts";
  return place.every((part) => usable(part.categoryId)) ? null : "no-category";
}

/** A transaction as entered by hand, or changed. Amounts in minor units; negative = money out. */
export type TransactionInput = {
  date: IsoDate;
  amount: number;
  payee: string | null;
  note: string | null;
  /** One place, or the parts of a split that add up to `amount`. */
  place: Place;
  /** When changing a transaction: the account it moves to. Left out, it stays where it is. */
  accountId?: number;
};

/**
 * The days a date typed by hand may be on; one outside them is a typo. Only
 * a date that is typed is checked: an imported date stays as it came in.
 */
export type DateRange = { earliest: IsoDate; latest: IsoDate };

function dateProblem(date: IsoDate, range?: DateRange): "early-date" | "future-date" | null {
  if (!range) return null;
  if (date < range.earliest) return "early-date";
  return date > range.latest ? "future-date" : null;
}

/**
 * Adds a transaction by hand, such as a cash payment, to an open account.
 * Like an imported one, a transaction dated on or before the account's
 * balance date is filled in behind the balance entered for that day.
 * Returns its id, or why it could not be added: the account is gone or
 * closed, a category is gone or archived, or the parts are not right.
 */
export function addTransaction(
  db: Db,
  accountId: number,
  input: TransactionInput,
  dates?: DateRange,
): { id: number } | "no-account" | "no-category" | "parts" | "early-date" | "future-date" {
  return db.transaction((tx) => {
    const wrongDate = dateProblem(input.date, dates);
    if (wrongDate) return wrongDate;
    const [account] = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.archived, false)))
      .all();
    if (!account) return "no-account";
    const problem = checkPlace(tx, input.place, input.amount, new Set());
    if (problem) return problem;

    const [{ id }] = tx
      .insert(transactions)
      .values({
        accountId,
        date: input.date,
        amount: input.amount,
        payee: input.payee,
        note: input.note,
      })
      .returning({ id: transactions.id })
      .all();
    writePlace(tx, id, input.place);
    syncStartingBalance(tx, accountId);
    return { id };
  });
}

/**
 * Changes a transaction. Its date, amount and account stay as they are when
 * it was imported, so the account keeps matching the bank (`imported`), or
 * when its account is closed, which has to keep holding nothing (`closed`);
 * nor can it move to an account that is closed or gone. A starting balance
 * is changed on the Accounts page instead.
 *
 * A changed transaction leaves the import that brought it in: undoing that
 * import removes the others, and keeps what was worked on.
 */
export function editTransaction(
  db: Db,
  id: number,
  input: TransactionInput,
  dates?: DateRange,
):
  | "saved"
  | "no-transaction"
  | "starting"
  | "imported"
  | "closed"
  | "no-account"
  | "no-category"
  | "parts"
  | "early-date"
  | "future-date" {
  return db.transaction((tx) => {
    const [found] = tx
      .select({
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
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
    const accountId = input.accountId ?? found.accountId;
    const otherAccount = accountId !== found.accountId;
    const moved = input.date !== found.date || input.amount !== found.amount || otherAccount;
    if (moved && found.importId !== null) return "imported";
    if (moved && found.closed) return "closed";
    if (input.date !== found.date) {
      const wrongDate = dateProblem(input.date, dates);
      if (wrongDate) return wrongDate;
    }
    if (otherAccount) {
      const [open] = tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.archived, false)))
        .all();
      if (!open) return "no-account";
    }

    const kept = new Set(
      [
        found.categoryId,
        ...tx
          .select({ categoryId: transactionSplits.categoryId })
          .from(transactionSplits)
          .where(eq(transactionSplits.transactionId, id))
          .all()
          .map((part) => part.categoryId),
      ].filter((categoryId) => categoryId !== null),
    );
    const problem = checkPlace(tx, input.place, input.amount, kept);
    if (problem) return problem;

    tx.update(transactions)
      .set({
        accountId,
        date: input.date,
        amount: input.amount,
        payee: input.payee,
        note: input.note,
        importBatch: null,
      })
      .where(eq(transactions.id, id))
      .run();
    writePlace(tx, id, input.place);
    if (moved) {
      syncStartingBalance(tx, found.accountId);
      if (otherAccount) syncStartingBalance(tx, accountId);
    }
    return "saved";
  });
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
  /** The group's id; "income" for the income categories, null for expense categories without a group. */
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
  categories: { id: number; name: string; archived: boolean; income: boolean }[];
  months: Month[];
} {
  return {
    // Open accounts first, each part in the order of the Accounts page.
    accounts: db
      .select({ id: accounts.id, name: accounts.name, closed: accounts.archived })
      .from(accounts)
      .all()
      .sort((a, b) => Number(a.closed) - Number(b.closed) || byName(a, b)),
    categories: db
      .select({
        id: categories.id,
        name: categories.name,
        archived: categories.archived,
        income: categories.income,
      })
      .from(categories)
      .orderBy(categories.archived, categories.name)
      .all(),
    // The months that have transactions, newest first.
    months: db
      .all<{ month: Month }>(
        sql`SELECT DISTINCT substr(${transactions.date}, 1, 7) AS month FROM ${transactions} ORDER BY month DESC`,
      )
      .map((row) => row.month),
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
