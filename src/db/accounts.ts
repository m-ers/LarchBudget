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

type AccountRow = { id: number; name: string; type: AccountType; balance: number };

export function getAccounts(db: Db): AccountRow[] {
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      balance: sql<number>`coalesce(sum(${transactions.amount}), 0)`.mapWith(Number),
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.archived, false))
    .groupBy(accounts.id)
    .orderBy(accounts.name)
    .all();
}

/**
 * Creates an account that held `startingBalance` at the end of
 * `balanceDate`. Returns its id.
 */
export function createAccount(
  db: Db,
  input: { name: string; type: AccountType; startingBalance: number; balanceDate: IsoDate },
): number {
  return db.transaction((tx) => {
    const { id } = tx.insert(accounts).values(input).returning().get();
    syncStartingBalance(tx, id);
    return id;
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
