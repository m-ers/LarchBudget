"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import * as accounts from "@/db/accounts";
import * as budget from "@/db/budget";
import * as transactions from "@/db/transactions";
import { accountTypes } from "@/lib/account-types";
import { getConfig } from "@/lib/config";
import { addMonths, isMonth, today, type IsoDate } from "@/lib/dates";
import { delimiters, parseCsv } from "@/lib/import/csv";
import {
  MAX_CELL_LENGTH,
  MAX_COLUMNS,
  MAX_FILE_BYTES,
  MAX_NOTE_LENGTH,
  MAX_PAYEE_LENGTH,
  MAX_ROWS,
} from "@/lib/import/limits";
import { applyMapping, isMapping, serializeMapping, type Mapping } from "@/lib/import/mapping";
import { EARLIEST_BALANCE_DATE, MAX_NAME_LENGTH } from "@/lib/limits";
import { minorUnitDigits, parseMoney } from "@/lib/money";
import type { ActionResult, Failure } from "@/lib/result";
import { isLoggedIn } from "./session";

/**
 * Every change to the data goes through one of these Server Actions. Each one
 * gets the database through `database()`, which is where the login is
 * checked; validates its input; and returns a result the interface can show.
 * The rules themselves live in `src/db`, whose functions say what happened;
 * here that is only turned into a message.
 */

/** The database, or null for a visitor who is not logged in. */
async function database(): Promise<Db | null> {
  return (await isLoggedIn()) ? getDb() : null;
}

const fail = (error: string): Failure => ({ ok: false, error });
const done = (): ActionResult => {
  refresh();
  return { ok: true };
};

const LOGGED_OUT = fail("Your session has ended. Reload the page to log in again.");
const UNEXPECTED = fail("Something went wrong. Reload the page and try again.");
const CATEGORY_GONE = fail("That category no longer exists.");
const GROUP_GONE = fail("That group no longer exists.");
const TRANSACTION_GONE = fail("That transaction no longer exists. Reload the page.");
const categoryNameTaken = (name: string) => fail(`You already have a category called "${name}".`);
const groupNameTaken = (name: string) => fail(`You already have a group called "${name}".`);

const id = z.number().int().positive();
const direction = z.enum(["up", "down"]);
const moneyEnd = z.union([id, z.literal("ready")]);
const name = z
  .string()
  .trim()
  .min(1, "Give it a name.")
  .max(MAX_NAME_LENGTH, `Keep the name under ${MAX_NAME_LENGTH} characters.`);

/** Amounts above this are almost certainly typos (and keep sums exact). */
const MAX_AMOUNT = 1_000_000_000_00;

/** Reads an amount someone typed. An empty field means zero; null means "not an amount". */
function parseAmount(input: string): number | null {
  if (input.trim() === "") return 0;
  const amount = parseMoney(input, getConfig().currency);
  if (amount === null || Math.abs(amount) > MAX_AMOUNT) return null;
  return amount;
}

// ---- Budget ----------------------------------------------------------------

export async function setAssignedAction(
  categoryId: number,
  month: string,
  input: string,
): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(categoryId).success || !isMonth(month)) return UNEXPECTED;

  const amount = parseAmount(String(input));
  if (amount === null) return fail("That is not an amount.");

  return budget.setAssigned(db, categoryId, month, amount) ? done() : CATEGORY_GONE;
}

/** Starts a month with what each category got the month before, where it has nothing yet. */
export async function copyLastMonthAction(month: string): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!isMonth(month)) return UNEXPECTED;

  budget.copyAssignments(db, addMonths(month, -1), month);
  return done();
}

export async function moveMoneyAction(
  from: budget.MoneyEnd,
  to: budget.MoneyEnd,
  month: string,
  input: string,
): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!moneyEnd.safeParse(from).success || !moneyEnd.safeParse(to).success || !isMonth(month)) {
    return UNEXPECTED;
  }

  const amount = parseAmount(String(input));
  if (amount === null) return fail("That is not an amount.");

  const result = budget.moveMoney(db, { from, to, month, amount });
  if (result === "not-positive") return fail("Enter an amount above zero.");
  if (result === "no-category") return CATEGORY_GONE;
  if (result === "same") return UNEXPECTED;
  return done();
}

export async function createCategoryAction(groupId: number, input: string): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(groupId).success) return UNEXPECTED;
  const parsed = name.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const result = budget.createCategory(db, parsed.data, groupId);
  if (result === "no-group") return GROUP_GONE;
  if (result === "name-taken") return categoryNameTaken(parsed.data);
  return done();
}

export async function createIncomeCategoryAction(input: string): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  const parsed = name.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  return budget.createIncomeCategory(db, parsed.data) === "name-taken"
    ? categoryNameTaken(parsed.data)
    : done();
}

export async function renameCategoryAction(
  categoryId: number,
  input: string,
): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(categoryId).success) return UNEXPECTED;
  const parsed = name.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  return budget.renameCategory(db, categoryId, parsed.data)
    ? done()
    : categoryNameTaken(parsed.data);
}

export async function archiveCategoryAction(categoryId: number): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(categoryId).success) return UNEXPECTED;

  budget.archiveCategory(db, categoryId);
  return done();
}

export async function moveCategoryAction(
  categoryId: number,
  to: budget.Direction,
): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(categoryId).success || !direction.safeParse(to).success) return UNEXPECTED;

  // Already first or last: nothing to do, and the page shows the order as it is.
  return budget.moveCategory(db, categoryId, to) === "gone" ? CATEGORY_GONE : done();
}

export async function moveCategoryToGroupAction(
  categoryId: number,
  groupId: number,
): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(categoryId).success || !id.safeParse(groupId).success) return UNEXPECTED;

  const result = budget.moveCategoryToGroup(db, categoryId, groupId);
  if (result === "no-category") return CATEGORY_GONE;
  if (result === "no-group") return GROUP_GONE;
  return done();
}

export async function restoreCategoryAction(categoryId: number): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(categoryId).success) return UNEXPECTED;

  const result = budget.restoreCategory(db, categoryId);
  if (result === "no-category") return CATEGORY_GONE;
  if (result === "name-taken") {
    return fail("Another category already has this name. Rename that one first.");
  }
  if (result === "no-group") return fail("There is no group to put it back in. Add a group first.");
  return done();
}

export async function createGroupAction(input: string): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  const parsed = name.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  return budget.createGroup(db, parsed.data) === "name-taken"
    ? groupNameTaken(parsed.data)
    : done();
}

export async function renameGroupAction(groupId: number, input: string): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(groupId).success) return UNEXPECTED;
  const parsed = name.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  return budget.renameGroup(db, groupId, parsed.data) ? done() : groupNameTaken(parsed.data);
}

export async function moveGroupAction(
  groupId: number,
  to: budget.Direction,
): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(groupId).success || !direction.safeParse(to).success) return UNEXPECTED;

  return budget.moveGroup(db, groupId, to) === "gone" ? GROUP_GONE : done();
}

export async function deleteGroupAction(groupId: number): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(groupId).success) return UNEXPECTED;

  budget.deleteGroup(db, groupId);
  return done();
}

// ---- Accounts --------------------------------------------------------------

const ACCOUNT_GONE = fail("That account no longer exists.");
const ACCOUNT_CLOSED =
  "Its account is closed. Reopen the account on the Accounts page first, then try again.";
const accountNameTaken = (name: string) => fail(`You already have an account called "${name}".`);

const accountType = z.enum(accountTypes);

/** The day an entered balance is from: a real date, and not after today. */
const balanceDate = z.iso
  .date("That is not a date.")
  .refine((date) => date <= today(), "The date cannot be in the future.")
  .refine((date) => date >= EARLIEST_BALANCE_DATE, "Check the year of the date.")
  .transform((date) => date as IsoDate);

const balanceInput = z.object({ startingBalance: z.string(), balanceDate });

/** Reads the "Balance" and "On" fields of a form. */
function readBalance(
  formData: FormData,
): { ok: true; startingBalance: number; balanceDate: IsoDate } | Failure {
  const parsed = balanceInput.safeParse({
    startingBalance: formData.get("startingBalance") ?? "",
    balanceDate: formData.get("balanceDate"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const startingBalance = parseAmount(parsed.data.startingBalance);
  if (startingBalance === null) return fail("The balance is not an amount.");
  return { ok: true, startingBalance, balanceDate: parsed.data.balanceDate };
}

const accountInput = z.object({ name, type: accountType });

export async function createAccountAction(formData: FormData): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  const parsed = accountInput.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const balance = readBalance(formData);
  if (!balance.ok) return balance;

  const result = accounts.createAccount(db, {
    ...parsed.data,
    startingBalance: balance.startingBalance,
    balanceDate: balance.balanceDate,
  });
  return result === "name-taken" ? accountNameTaken(parsed.data.name) : done();
}

export async function renameAccountAction(accountId: number, input: string): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(accountId).success) return UNEXPECTED;
  const parsed = name.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const result = accounts.renameAccount(db, accountId, parsed.data);
  if (result === "name-taken") return accountNameTaken(parsed.data);
  return result === "gone" ? ACCOUNT_GONE : done();
}

export async function setAccountTypeAction(accountId: number, type: string): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  const parsed = accountType.safeParse(type);
  if (!id.safeParse(accountId).success || !parsed.success) return UNEXPECTED;

  return accounts.setAccountType(db, accountId, parsed.data) ? done() : ACCOUNT_GONE;
}

export async function setAccountBalanceAction(
  accountId: number,
  formData: FormData,
): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(accountId).success) return UNEXPECTED;
  const balance = readBalance(formData);
  if (!balance.ok) return balance;

  const changed = accounts.setAccountBalance(db, accountId, {
    startingBalance: balance.startingBalance,
    balanceDate: balance.balanceDate,
  });
  return changed ? done() : ACCOUNT_GONE;
}

export async function closeAccountAction(accountId: number): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(accountId).success) return UNEXPECTED;

  const result = accounts.closeAccount(db, accountId);
  if (result === "not-empty") return fail("Only an account that holds nothing can be closed.");
  return result === "gone" ? ACCOUNT_GONE : done();
}

export async function reopenAccountAction(accountId: number): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(accountId).success) return UNEXPECTED;

  const result = accounts.reopenAccount(db, accountId);
  if (result === "name-taken") {
    return fail("You already have an account with this name. Rename that one first.");
  }
  return result === "gone" ? ACCOUNT_GONE : done();
}

export async function deleteAccountAction(accountId: number): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(accountId).success) return UNEXPECTED;

  return accounts.deleteAccount(db, accountId) ? done() : ACCOUNT_GONE;
}

// ---- Bank import -----------------------------------------------------------

const importInput = z.object({
  accountId: id,
  /**
   * The file's text, as one string. Its rows are not sent as a list: Next.js
   * refuses a Server Action whose lists hold more than a million items and
   * characters together, which a bank file of about 1 MB already does.
   */
  text: z.string().max(MAX_FILE_BYTES),
  /** What separates the cells, as the person confirmed it on the import screen. */
  delimiter: z.enum(delimiters),
  mapping: z.custom<Mapping>(isMapping),
});

/** The file's rows, including a header row if it has one. */
const importRows = z
  .array(z.array(z.string().max(MAX_CELL_LENGTH)).max(MAX_COLUMNS))
  .min(1)
  .max(MAX_ROWS);

/**
 * What was imported. `beforeBalance`, `startingBalance` and `balanceDate`
 * let the import page say which rows were filled in behind the balance
 * entered for the account.
 */
type ImportResult = ({ ok: true; batch: string } & transactions.ImportOutcome) | Failure;

/**
 * Reads the file a person chose into transactions, with the code the import
 * screen used for its preview: the file is sent as text, so the server reads
 * the same file the same way.
 */
function readImportFile(input: unknown) {
  const parsed = importInput.safeParse(input);
  if (!parsed.success) return null;
  const { accountId, text, delimiter, mapping } = parsed.data;
  const parsedRows = importRows.safeParse(parseCsv(text, delimiter));
  if (!parsedRows.success) return null;
  const rows = parsedRows.data;
  const read = applyMapping(rows, mapping, minorUnitDigits(getConfig().currency));
  return { accountId, mapping, delimiter, rows, read };
}

/** Imports a bank file into an account. */
export async function importTransactionsAction(input: unknown): Promise<ImportResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  const file = readImportFile(input);
  if (!file) return fail("This file could not be imported.");
  const { accountId, mapping, delimiter, rows, read } = file;
  if (read.rows.length === 0) return fail("No transactions could be read from this file.");
  if (read.rows.some((row) => Math.abs(row.amount) > MAX_AMOUNT)) {
    return fail("This file holds an amount that is too large to be real.");
  }

  const batch = randomUUID();
  const result = transactions.importTransactions(
    db,
    accountId,
    read.rows.map((row) => ({
      ...row,
      payee: row.payee?.slice(0, MAX_PAYEE_LENGTH) ?? null,
      note: row.note?.slice(0, MAX_NOTE_LENGTH) ?? null,
    })),
    batch,
  );
  if (result === null) return fail("That account no longer exists.");

  transactions.saveImportMapping(db, accountId, serializeMapping(rows, mapping, delimiter));
  refresh();
  return { ok: true, ...result, batch };
}

type CheckResult = { ok: true; known: number[] } | Failure;

/**
 * Says which of a file's readable rows the account has already, so the
 * import screen can show what is new before anything is imported. `known`
 * holds positions in the list of readable rows, which keeps the answer small.
 */
export async function checkImportAction(input: unknown): Promise<CheckResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  const file = readImportFile(input);
  if (!file) return fail("This file could not be checked.");
  return { ok: true, known: transactions.findKnownRows(db, file.accountId, file.read.rows) };
}

type UndoResult = { ok: true; removed: number } | Failure;

export async function undoImportAction(batch: string): Promise<UndoResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!z.uuid().safeParse(batch).success) return UNEXPECTED;

  const { removed, sorted, closed } = transactions.undoImport(db, batch);
  if (closed) return fail(ACCOUNT_CLOSED);
  if (sorted > 0) {
    return fail(
      sorted === 1
        ? "One of these transactions has been sorted since, so this import can no longer be undone."
        : `${sorted} of these transactions have been sorted since, so this import can no longer be undone.`,
    );
  }
  refresh();
  return { ok: true, removed };
}

// ---- Transactions ----------------------------------------------------------

const sortTarget = z.union([id, z.literal("ready"), z.literal("unsorted")]);

export async function sortTransactionAction(
  transactionId: number,
  target: transactions.SortTarget,
): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  const parsedTarget = sortTarget.safeParse(target);
  if (!id.safeParse(transactionId).success || !parsedTarget.success) return UNEXPECTED;

  const result = transactions.sortTransaction(db, transactionId, parsedTarget.data);
  if (result === "no-transaction") return TRANSACTION_GONE;
  if (result === "starting") return fail("A starting balance does not go into a category.");
  return result === "no-category" ? CATEGORY_GONE : done();
}

export async function deleteTransactionAction(transactionId: number): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(transactionId).success) return UNEXPECTED;

  const result = transactions.deleteTransaction(db, transactionId);
  if (result === "no-transaction") return TRANSACTION_GONE;
  if (result === "closed") return fail(ACCOUNT_CLOSED);
  return result === "starting" ? fail("A starting balance cannot be deleted.") : done();
}
