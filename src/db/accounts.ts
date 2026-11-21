import { and, eq, sql } from "drizzle-orm";
import type { AccountType } from "../lib/account-types";
import type { IsoDate } from "../lib/dates";
import type { Db } from "./index";
import { accounts, transactions } from "./schema";

/**
 * Accounts and the balance their owner entered for them.
 *
 * An account's balance is never stored: it is the sum of its transactions.
 * What is stored is what its owner said it held at the end of one day
 * (`startingBalance` on `balanceDate`). The account's "Starting balance"
 * transaction is derived from that and kept in step by
 * `syncStartingBalance`, so the account always holds exactly that amount at
 * the end of that day, whatever history is imported or removed later.
 *
 * Like `budget.ts`, these functions take the database as an argument and
 * never touch Next.js, so they can be unit tested.
 */

/** The payee of an account's starting balance transaction. */
const STARTING_PAYEE = "Starting balance";

/** Compares account names ignoring case, but not accents: "savings" is "Savings", "Cafe" is not "Café". */
const names = new Intl.Collator(undefined, { sensitivity: "accent" });

/** Sorts accounts alphabetically, ignoring case: "savings" comes before "Visa". */
export const byName = (a: { name: string }, b: { name: string }) => names.compare(a.name, b.name);

/** What an account holds: the sum of its transactions. */
const balance = sql<number>`coalesce(sum(${transactions.amount}), 0)`.mapWith(Number);

export type AccountRow = {
  id: number;
  name: string;
  type: AccountType;
  /** What it holds now, with every transaction counted. */
  balance: number;
  /** What its owner entered: it held `startingBalance` at the end of `balanceDate`. */
  startingBalance: number | null;
  balanceDate: IsoDate | null;
  /** How many transactions it has, not counting its starting balance. */
  transactionCount: number;
};

/** The open accounts. */
export function getAccounts(db: Db): AccountRow[] {
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      balance,
      startingBalance: accounts.startingBalance,
      balanceDate: accounts.balanceDate,
      transactionCount:
        sql<number>`count(${transactions.id}) FILTER (WHERE ${transactions.starting} = 0)`.mapWith(
          Number,
        ),
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.archived, false))
    .groupBy(accounts.id)
    .all()
    .sort(byName);
}

/** Accounts that were closed, which can be reopened. */
export function getClosedAccounts(db: Db): { id: number; name: string }[] {
  return db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.archived, true))
    .all()
    .sort(byName);
}

/** True when an open account other than `exceptId` already uses this name, ignoring case. */
function accountNameTaken(db: Db, name: string, exceptId?: number): boolean {
  return db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.archived, false))
    .all()
    .some((account) => account.id !== exceptId && names.compare(account.name, name) === 0);
}

/**
 * Creates an account that held `startingBalance` at the end of
 * `balanceDate`. Returns its id, or "name-taken".
 */
export function createAccount(
  db: Db,
  input: { name: string; type: AccountType; startingBalance: number; balanceDate: IsoDate },
): number | "name-taken" {
  return db.transaction((tx) => {
    if (accountNameTaken(tx, input.name)) return "name-taken";
    const { id } = tx.insert(accounts).values(input).returning().get();
    syncStartingBalance(tx, id);
    return id;
  });
}

/** What came of changing an account: it worked, its name is in use, or it no longer exists. */
export type AccountChange = "done" | "name-taken" | "gone";

/** Renames an account. Changes nothing when another open account has the name. */
export function renameAccount(db: Db, id: number, name: string): AccountChange {
  return db.transaction((tx) => {
    if (accountNameTaken(tx, name, id)) return "name-taken";
    const changes = tx.update(accounts).set({ name }).where(eq(accounts.id, id)).run().changes;
    return changes > 0 ? "done" : "gone";
  });
}

/** Returns false when the account no longer exists. */
export function setAccountType(db: Db, id: number, type: AccountType): boolean {
  return db.update(accounts).set({ type }).where(eq(accounts.id, id)).run().changes > 0;
}

/**
 * Changes what the account held at the end of a day, and moves its starting
 * balance to match. Returns false, and changes nothing, when the account
 * does not exist or is closed: a closed account holds nothing.
 */
export function setAccountBalance(
  db: Db,
  id: number,
  input: { startingBalance: number; balanceDate: IsoDate },
): boolean {
  return db.transaction((tx) => {
    const changes = tx
      .update(accounts)
      .set(input)
      .where(and(eq(accounts.id, id), eq(accounts.archived, false)))
      .run().changes;
    if (changes === 0) return false;
    syncStartingBalance(tx, id);
    return true;
  });
}

/**
 * Closes an account: it leaves the list and the import page, and its
 * transactions stay. Only an account that holds nothing can be closed, so
 * no money disappears from view.
 */
export function closeAccount(db: Db, id: number): "closed" | "not-empty" | "gone" {
  return db.transaction((tx) => {
    const [account] = tx
      .select({ balance })
      .from(accounts)
      .leftJoin(transactions, eq(transactions.accountId, accounts.id))
      .where(eq(accounts.id, id))
      .groupBy(accounts.id)
      .all();
    if (!account) return "gone";
    if (account.balance !== 0) return "not-empty";
    tx.update(accounts).set({ archived: true }).where(eq(accounts.id, id)).run();
    return "closed";
  });
}

/** Reopens a closed account. Changes nothing when an open account has its name. */
export function reopenAccount(db: Db, id: number): AccountChange {
  return db.transaction((tx) => {
    const [account] = tx
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, id))
      .all();
    if (!account) return "gone";
    if (accountNameTaken(tx, account.name, id)) return "name-taken";
    tx.update(accounts).set({ archived: false }).where(eq(accounts.id, id)).run();
    return "done";
  });
}

/**
 * Deletes an account and all its transactions, as if it had never been
 * added. What was spent from it leaves the categories it was sorted into.
 * Returns false when the account no longer exists.
 */
export function deleteAccount(db: Db, id: number): boolean {
  return db.transaction((tx) => {
    tx.delete(transactions).where(eq(transactions.accountId, id)).run();
    return tx.delete(accounts).where(eq(accounts.id, id)).run().changes > 0;
  });
}

/**
 * Makes the account's starting balance transaction agree with what its
 * owner entered again. Call it, inside the same database transaction, after
 * anything that adds, removes or moves the account's transactions, or
 * changes its entered balance or date:
 *
 *   amount = entered balance − the account's other transactions dated on
 *            or before the balance date
 *   date   = the balance date, or the day before the account's earliest
 *            other transaction when that is earlier
 *
 * So the account holds the entered balance at the end of that day, and the
 * starting balance always comes before everything else. It is removed when
 * its amount is 0. An account without a balance date is left alone.
 */
export function syncStartingBalance(db: Db, accountId: number): void {
  const [account] = db
    .select({ startingBalance: accounts.startingBalance, balanceDate: accounts.balanceDate })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .all();
  if (!account || account.startingBalance === null || account.balanceDate === null) return;
  const { startingBalance, balanceDate } = account;

  const [history] = db.all<{ until_balance_date: number; day_before_first: IsoDate | null }>(sql`
    SELECT
      coalesce(sum(CASE WHEN date <= ${balanceDate} THEN amount END), 0) AS until_balance_date,
      date(min(date), '-1 day') AS day_before_first
    FROM transactions
    WHERE account_id = ${accountId} AND starting = 0
  `);

  const amount = startingBalance - history.until_balance_date;
  const date =
    history.day_before_first !== null && history.day_before_first < balanceDate
      ? history.day_before_first
      : balanceDate;
  const starting = and(eq(transactions.accountId, accountId), eq(transactions.starting, true));

  if (amount === 0) {
    db.delete(transactions).where(starting).run();
  } else if (db.update(transactions).set({ amount, date }).where(starting).run().changes === 0) {
    db.insert(transactions)
      .values({ accountId, date, amount, payee: STARTING_PAYEE, starting: true })
      .run();
  }
}
