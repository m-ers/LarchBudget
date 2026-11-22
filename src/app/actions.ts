"use server";

import { randomUUID } from "node:crypto";
import { refresh, revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import * as accounts from "@/db/accounts";
import * as budget from "@/db/budget";
import * as rules from "@/db/rules";
import * as transactions from "@/db/transactions";
import { accountTypes } from "@/lib/account-types";
import { isCategoryIcon, type CategoryIcon } from "@/lib/category-icons";
import { isGroupColorSlot } from "@/lib/group-colors";
import { getConfig } from "@/lib/config";
import { addMonths, isMonth, today, type IsoDate, type Month } from "@/lib/dates";
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
import {
  EARLIEST_BALANCE_DATE,
  MAX_AMOUNT,
  MAX_NAME_LENGTH,
  MAX_RULE_TEXT_LENGTH,
  MAX_RULES,
} from "@/lib/limits";
import { minorUnitDigits, parseMoney } from "@/lib/money";
import type { ActionResult, Failure } from "@/lib/result";
import { isTargetKind, type Target } from "@/lib/targets";
import { isLanguage, LANGUAGE_COOKIE } from "@/i18n/languages";
import { PSEUDO_LANGUAGE } from "@/i18n/pseudo";
import { getT } from "@/i18n/server";
import type { MessageKey, Translate } from "@/i18n/translate";
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

const loggedOut = (t: Translate) => fail(t("errors.loggedOut"));
const unexpected = (t: Translate) => fail(t("errors.unexpected"));
const categoryGone = (t: Translate) => fail(t("errors.budget.categoryGone"));
const groupGone = (t: Translate) => fail(t("errors.budget.groupGone"));
const transactionGone = (t: Translate) => fail(t("errors.transactions.gone"));
const categoryNameTaken = (t: Translate, name: string) =>
  fail(t("errors.budget.categoryNameTaken", { name }));
const groupNameTaken = (t: Translate, name: string) =>
  fail(t("errors.budget.groupNameTaken", { name }));

/** A schema's message is the key of its text; this turns the first problem found into text. */
const firstProblem = (t: Translate, error: z.ZodError) =>
  fail(t(error.issues[0].message as MessageKey, { max: MAX_NAME_LENGTH }));

const id = z.number().int().positive();
const direction = z.enum(["up", "down"]);
const moneyEnd = z.union([id, z.literal("ready")]);
const name = z
  .string()
  .trim()
  .min(1, "errors.name.required")
  .max(MAX_NAME_LENGTH, "errors.name.tooLong");

/** Reads an amount someone typed. An empty field means zero; null means "not an amount". */
function parseAmount(input: string): number | null {
  if (input.trim() === "") return 0;
  const { currency, locale } = getConfig();
  const amount = parseMoney(input, currency, locale);
  if (amount === null || Math.abs(amount) > MAX_AMOUNT) return null;
  return amount;
}

// ---- Budget ----------------------------------------------------------------

export async function setAssignedAction(
  categoryId: number,
  month: string,
  input: string,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success || !isMonth(month)) return unexpected(t);

  const amount = parseAmount(String(input));
  if (amount === null) return fail(t("errors.budget.notAnAmount"));

  return budget.setAssigned(db, categoryId, month, amount) ? done() : categoryGone(t);
}

/** Starts a month with what each category got the month before, where it has nothing yet. */
export async function copyLastMonthAction(month: string): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!isMonth(month)) return unexpected(t);

  budget.copyAssignments(db, addMonths(month, -1), month);
  return done();
}

/**
 * Gives a category a target: its kind, the amount as typed, and for
 * "byMonth" the month to reach it by (null for the other kinds).
 */
export async function setTargetAction(
  categoryId: number,
  kind: string,
  input: string,
  month: string | null,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success || !isTargetKind(kind)) return unexpected(t);
  // Only "by a month" has a month.
  if (kind === "byMonth" ? !isMonth(month) : month !== null) return unexpected(t);

  const amount = parseAmount(String(input));
  if (amount === null) return fail(t("errors.budget.notAnAmount"));
  if (amount <= 0) return fail(t("errors.budget.amountNotPositive"));

  const target: Target =
    kind === "byMonth" ? { kind, amount, month: month as Month } : { kind, amount };
  const result = budget.setTarget(db, categoryId, target);
  if (result === "no-category") return categoryGone(t);
  if (result === "invalid") return unexpected(t);
  return done();
}

export async function removeTargetAction(categoryId: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success) return unexpected(t);

  return budget.removeTarget(db, categoryId) ? done() : categoryGone(t);
}

/**
 * Adds what each target still needs in a month to its category's Assigned
 * amount. The needs are worked out again here, never taken from the page,
 * so a second click adds nothing. `thisMonth` is the current month the page
 * worked its needs out for; when the month has changed since, the page
 * showed needs that may no longer hold, and nothing is assigned.
 */
export async function assignTargetsAction(month: string, thisMonth: string): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!isMonth(month) || !isMonth(thisMonth)) return unexpected(t);

  return budget.assignTargets(db, month, thisMonth) === "month-changed"
    ? fail(t("errors.budget.monthChanged"))
    : done();
}

const seenAmounts = z.object({
  from: z.number().int().nullable(),
  to: z.number().int().nullable(),
});

/** `seen`: the Assigned amounts the form showed, so a repeated request moves the money once. */
export async function moveMoneyAction(
  from: budget.MoneyEnd,
  to: budget.MoneyEnd,
  month: string,
  input: string,
  seen: { from: number | null; to: number | null },
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const parsedSeen = seenAmounts.safeParse(seen);
  if (
    !moneyEnd.safeParse(from).success ||
    !moneyEnd.safeParse(to).success ||
    !isMonth(month) ||
    !parsedSeen.success
  ) {
    return unexpected(t);
  }

  const amount = parseAmount(String(input));
  if (amount === null) return fail(t("errors.budget.notAnAmount"));

  const result = budget.moveMoney(db, { from, to, month, amount, seen: parsedSeen.data });
  if (result === "not-positive") return fail(t("errors.budget.amountNotPositive"));
  if (result === "no-category") return categoryGone(t);
  if (result === "same") return unexpected(t);
  if (result === "changed") {
    // Show the amounts as they are now, so the next try starts from them.
    refresh();
    return fail(t("errors.budget.amountsChanged"));
  }
  return done();
}

export async function createCategoryAction(groupId: number, input: string): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(groupId).success) return unexpected(t);
  const parsed = name.safeParse(input);
  if (!parsed.success) return firstProblem(t, parsed.error);

  const result = budget.createCategory(db, parsed.data, groupId);
  if (result === "no-group") return groupGone(t);
  if (result === "name-taken") return categoryNameTaken(t, parsed.data);
  return done();
}

export async function createIncomeCategoryAction(input: string): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const parsed = name.safeParse(input);
  if (!parsed.success) return firstProblem(t, parsed.error);

  return budget.createIncomeCategory(db, parsed.data) === "name-taken"
    ? categoryNameTaken(t, parsed.data)
    : done();
}

export async function renameCategoryAction(
  categoryId: number,
  input: string,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success) return unexpected(t);
  const parsed = name.safeParse(input);
  if (!parsed.success) return firstProblem(t, parsed.error);

  return budget.renameCategory(db, categoryId, parsed.data)
    ? done()
    : categoryNameTaken(t, parsed.data);
}

/** Whether what comes in through an income category counts for the next month. */
export async function setNextMonthAction(categoryId: number, on: boolean): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success || typeof on !== "boolean") return unexpected(t);

  return budget.setNextMonth(db, categoryId, on) ? done() : categoryGone(t);
}

/** Gives a category one of the icons in the set, or the envelope again with null. */
export async function setCategoryIconAction(
  categoryId: number,
  icon: CategoryIcon | null,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success || (icon !== null && !isCategoryIcon(icon))) {
    return unexpected(t);
  }

  return budget.setCategoryIcon(db, categoryId, icon) ? done() : categoryGone(t);
}

export async function archiveCategoryAction(categoryId: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success) return unexpected(t);

  budget.archiveCategory(db, categoryId);
  return done();
}

export async function moveCategoryAction(
  categoryId: number,
  to: budget.Direction,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success || !direction.safeParse(to).success) return unexpected(t);

  // Already first or last: nothing to do, and the page shows the order as it is.
  return budget.moveCategory(db, categoryId, to) === "gone" ? categoryGone(t) : done();
}

export async function moveCategoryToGroupAction(
  categoryId: number,
  groupId: number,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success || !id.safeParse(groupId).success) return unexpected(t);

  const result = budget.moveCategoryToGroup(db, categoryId, groupId);
  if (result === "no-category") return categoryGone(t);
  if (result === "no-group") return groupGone(t);
  return done();
}

export async function restoreCategoryAction(categoryId: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(categoryId).success) return unexpected(t);

  const result = budget.restoreCategory(db, categoryId);
  if (result === "no-category") return categoryGone(t);
  if (result === "name-taken") {
    return fail(t("errors.budget.restoreNameTaken"));
  }
  if (result === "no-group") return fail(t("errors.budget.restoreNoGroup"));
  return done();
}

export async function createGroupAction(input: string): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const parsed = name.safeParse(input);
  if (!parsed.success) return firstProblem(t, parsed.error);

  return budget.createGroup(db, parsed.data) === "name-taken"
    ? groupNameTaken(t, parsed.data)
    : done();
}

export async function renameGroupAction(groupId: number, input: string): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(groupId).success) return unexpected(t);
  const parsed = name.safeParse(input);
  if (!parsed.success) return firstProblem(t, parsed.error);

  return budget.renameGroup(db, groupId, parsed.data) ? done() : groupNameTaken(t, parsed.data);
}

/** Gives a group one of the six colours of the palette, by its slot. */
export async function setGroupColorAction(groupId: number, slot: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(groupId).success || !isGroupColorSlot(slot)) return unexpected(t);

  return budget.setGroupColor(db, groupId, slot) ? done() : groupGone(t);
}

export async function moveGroupAction(
  groupId: number,
  to: budget.Direction,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(groupId).success || !direction.safeParse(to).success) return unexpected(t);

  return budget.moveGroup(db, groupId, to) === "gone" ? groupGone(t) : done();
}

export async function deleteGroupAction(groupId: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(groupId).success) return unexpected(t);

  budget.deleteGroup(db, groupId);
  return done();
}

// ---- Accounts --------------------------------------------------------------

const accountGone = (t: Translate) => fail(t("errors.accounts.gone"));
const accountNameTaken = (t: Translate, name: string) =>
  fail(t("errors.accounts.nameTaken", { name }));

const accountType = z.enum(accountTypes);

/** The day an entered balance is from: a real date, and not after today. */
const balanceDate = z.iso
  .date("errors.accounts.notADate")
  .refine((date) => date <= today(), "errors.accounts.futureDate")
  .refine((date) => date >= EARLIEST_BALANCE_DATE, "errors.accounts.checkYear")
  .transform((date) => date as IsoDate);

const balanceInput = z.object({ startingBalance: z.string(), balanceDate });

/** Reads the "Balance" and "On" fields of a form. */
function readBalance(
  t: Translate,
  formData: FormData,
): { ok: true; startingBalance: number; balanceDate: IsoDate } | Failure {
  const parsed = balanceInput.safeParse({
    startingBalance: formData.get("startingBalance") ?? "",
    balanceDate: formData.get("balanceDate"),
  });
  if (!parsed.success) return firstProblem(t, parsed.error);

  const startingBalance = parseAmount(parsed.data.startingBalance);
  if (startingBalance === null) return fail(t("errors.accounts.balanceNotAnAmount"));
  return { ok: true, startingBalance, balanceDate: parsed.data.balanceDate };
}

const accountInput = z.object({ name, type: accountType });

export async function createAccountAction(formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const parsed = accountInput.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
  });
  if (!parsed.success) return firstProblem(t, parsed.error);
  const balance = readBalance(t, formData);
  if (!balance.ok) return balance;

  const result = accounts.createAccount(db, {
    ...parsed.data,
    startingBalance: balance.startingBalance,
    balanceDate: balance.balanceDate,
  });
  return result === "name-taken" ? accountNameTaken(t, parsed.data.name) : done();
}

export async function renameAccountAction(accountId: number, input: string): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(accountId).success) return unexpected(t);
  const parsed = name.safeParse(input);
  if (!parsed.success) return firstProblem(t, parsed.error);

  const result = accounts.renameAccount(db, accountId, parsed.data);
  if (result === "name-taken") return accountNameTaken(t, parsed.data);
  return result === "gone" ? accountGone(t) : done();
}

export async function setAccountTypeAction(accountId: number, type: string): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const parsed = accountType.safeParse(type);
  if (!id.safeParse(accountId).success || !parsed.success) return unexpected(t);

  return accounts.setAccountType(db, accountId, parsed.data) ? done() : accountGone(t);
}

export async function setAccountBalanceAction(
  accountId: number,
  formData: FormData,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(accountId).success) return unexpected(t);
  const balance = readBalance(t, formData);
  if (!balance.ok) return balance;

  const changed = accounts.setAccountBalance(db, accountId, {
    startingBalance: balance.startingBalance,
    balanceDate: balance.balanceDate,
  });
  return changed ? done() : accountGone(t);
}

export async function closeAccountAction(accountId: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(accountId).success) return unexpected(t);

  const result = accounts.closeAccount(db, accountId);
  if (result === "not-empty") return fail(t("errors.accounts.notEmpty"));
  return result === "gone" ? accountGone(t) : done();
}

export async function reopenAccountAction(accountId: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(accountId).success) return unexpected(t);

  const result = accounts.reopenAccount(db, accountId);
  if (result === "name-taken") {
    return fail(t("errors.accounts.reopenNameTaken"));
  }
  return result === "gone" ? accountGone(t) : done();
}

export async function deleteAccountAction(accountId: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(accountId).success) return unexpected(t);

  return accounts.deleteAccount(db, accountId) ? done() : accountGone(t);
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
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const file = readImportFile(input);
  if (!file) return fail(t("errors.import.cannotImport"));
  const { accountId, mapping, delimiter, rows, read } = file;
  if (read.rows.length === 0) return fail(t("errors.import.noTransactions"));
  if (read.rows.some((row) => Math.abs(row.amount) > MAX_AMOUNT)) {
    return fail(t("errors.import.amountTooLarge"));
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
  if (result === null) return accountGone(t);

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
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const file = readImportFile(input);
  if (!file) return fail(t("errors.import.cannotCheck"));
  return { ok: true, known: transactions.findKnownRows(db, file.accountId, file.read.rows) };
}

type UndoResult = { ok: true; removed: number } | Failure;

export async function undoImportAction(batch: string): Promise<UndoResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!z.uuid().safeParse(batch).success) return unexpected(t);

  const { removed, sorted, closed } = transactions.undoImport(db, batch);
  if (closed) return fail(t("errors.accounts.closed"));
  if (sorted > 0) {
    return fail(t("errors.import.undoSorted", { count: sorted }));
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
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const parsedTarget = sortTarget.safeParse(target);
  if (!id.safeParse(transactionId).success || !parsedTarget.success) return unexpected(t);

  const result = transactions.sortTransaction(db, transactionId, parsedTarget.data);
  if (result === "no-transaction") return transactionGone(t);
  if (result === "starting") return fail(t("errors.transactions.startingNotSortable"));
  return result === "no-category" ? categoryGone(t) : done();
}

/** The most parts one transaction can be split into; a receipt never needs more. */
const MAX_PARTS = 30;

/**
 * A transaction as typed into its form. Amounts are as typed and never
 * negative: `direction` says whether the money went out or came in. A part
 * goes the same way as the whole, unless it is typed with a minus (a refund
 * within a payment).
 */
const transactionForm = z.object({
  date: z.iso.date("errors.accounts.notADate").transform((date) => date as IsoDate),
  amount: z.string().max(40),
  direction: z.enum(["out", "in"]),
  payee: z.string().trim().max(MAX_PAYEE_LENGTH),
  note: z.string().trim().max(MAX_NOTE_LENGTH),
  /** When changing a transaction: the account it moves to. */
  accountId: id.optional(),
  place: z.union([
    sortTarget,
    z
      .array(z.object({ categoryId: id.nullable(), amount: z.string().max(40) }))
      .min(transactions.MIN_PARTS)
      .max(MAX_PARTS),
  ]),
});

export type TransactionForm = z.input<typeof transactionForm>;

/** Reads a transaction's form into what the database takes, or the first problem as text. */
function readTransactionForm(
  t: Translate,
  input: unknown,
): { ok: true; value: transactions.TransactionInput } | Failure {
  const parsed = transactionForm.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return message.startsWith("errors.") ? firstProblem(t, parsed.error) : unexpected(t);
  }
  const { date, direction, payee, note, place, accountId } = parsed.data;
  const sign = direction === "out" ? -1 : 1;

  const amount = parseAmount(parsed.data.amount);
  if (amount === null) return fail(t("errors.budget.notAnAmount"));
  if (amount <= 0) return fail(t("errors.budget.amountNotPositive"));

  let parts: transactions.NewPart[] | null = null;
  if (Array.isArray(place)) {
    parts = [];
    for (const part of place) {
      const partAmount = parseAmount(part.amount);
      if (partAmount === null) return fail(t("errors.budget.notAnAmount"));
      if (partAmount === 0) return fail(t("errors.transactions.partZero"));
      parts.push({ categoryId: part.categoryId, amount: sign * partAmount });
    }
  }
  return {
    ok: true,
    value: {
      date,
      amount: sign * amount,
      payee: payee || null,
      note: note || null,
      place: parts ?? (place as transactions.SortTarget),
      accountId,
    },
  };
}

/**
 * The days a typed date may be on. A day of leeway at the end, for a server
 * whose clock is in another time zone.
 */
const typedDates = (): transactions.DateRange => ({
  earliest: EARLIEST_BALANCE_DATE as IsoDate,
  latest: today(new Date(Date.now() + 86_400_000)),
});

/** Turns why a transaction could not be added or changed into a message. */
function transactionProblem(
  t: Translate,
  problem:
    | "no-category"
    | "parts"
    | "imported"
    | "closed"
    | "starting"
    | "no-transaction"
    | "no-account"
    | "early-date"
    | "future-date",
): Failure {
  switch (problem) {
    case "no-account":
      return accountGone(t);
    case "early-date":
      return fail(t("errors.accounts.checkYear"));
    case "future-date":
      return fail(t("errors.accounts.futureDate"));
    case "no-category":
      return categoryGone(t);
    case "parts":
      return fail(t("errors.transactions.partsTotal"));
    case "imported":
      return fail(t("errors.transactions.imported"));
    case "closed":
      return fail(t("errors.accounts.closed"));
    case "starting":
      return fail(t("errors.transactions.startingNotEditable"));
    case "no-transaction":
      return transactionGone(t);
  }
}

/** Adds a transaction by hand, such as a cash payment. */
export async function addTransactionAction(
  accountId: number,
  form: TransactionForm,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(accountId).success) return unexpected(t);
  const read = readTransactionForm(t, form);
  if (!read.ok) return read;

  const result = transactions.addTransaction(db, accountId, read.value, typedDates());
  return typeof result === "string" ? transactionProblem(t, result) : done();
}

/** Changes a transaction: for an imported one, everything but its date, amount and account. */
export async function editTransactionAction(
  transactionId: number,
  form: TransactionForm,
): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(transactionId).success) return unexpected(t);
  const read = readTransactionForm(t, form);
  if (!read.ok) return read;

  const result = transactions.editTransaction(db, transactionId, read.value, typedDates());
  return result === "saved" ? done() : transactionProblem(t, result);
}

export async function deleteTransactionAction(transactionId: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(transactionId).success) return unexpected(t);

  const result = transactions.deleteTransaction(db, transactionId);
  if (result === "no-transaction") return transactionGone(t);
  if (result === "closed") return fail(t("errors.accounts.closed"));
  return result === "starting" ? fail(t("errors.transactions.startingNotDeletable")) : done();
}

// ---- Sorting rules ---------------------------------------------------------

const ruleText = z.string().max(1_000);
const ruleTarget = z.union([id, z.literal("ready")]);

/** `sorted`: how many transactions the rule sorted or moved just now. */
type RuleResult = { ok: true; sorted: number } | Failure;

function ruleProblem(t: Translate, problem: rules.RuleProblem): Failure {
  switch (problem) {
    case "empty":
      return fail(t("errors.rules.empty"));
    case "too-long":
      return fail(t("errors.rules.tooLong", { max: MAX_RULE_TEXT_LENGTH }));
    case "text-taken":
      return fail(t("errors.rules.textTaken"));
    case "no-category":
      return categoryGone(t);
    case "too-many":
      return fail(t("errors.rules.tooMany", { max: MAX_RULES }));
    case "no-rule":
      return fail(t("errors.rules.gone"));
  }
}

/** Makes a rule, and sorts the transactions still to sort that it fits. */
export async function createRuleAction(
  text: string,
  target: rules.RuleTarget,
): Promise<RuleResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const parsedText = ruleText.safeParse(text);
  const parsedTarget = ruleTarget.safeParse(target);
  if (!parsedText.success || !parsedTarget.success) return unexpected(t);

  const result = rules.createRule(db, parsedText.data, parsedTarget.data);
  if (typeof result === "string") return ruleProblem(t, result);
  refresh();
  return { ok: true, sorted: result.sorted };
}

/** Changes what a rule looks for and where it sends transactions. */
export async function updateRuleAction(
  ruleId: number,
  text: string,
  target: rules.RuleTarget,
): Promise<RuleResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  const parsedText = ruleText.safeParse(text);
  const parsedTarget = ruleTarget.safeParse(target);
  if (!id.safeParse(ruleId).success || !parsedText.success || !parsedTarget.success) {
    return unexpected(t);
  }

  const result = rules.updateRule(db, ruleId, parsedText.data, parsedTarget.data);
  if (typeof result === "string") return ruleProblem(t, result);
  refresh();
  return { ok: true, sorted: result.sorted };
}

export async function deleteRuleAction(ruleId: number): Promise<ActionResult> {
  const t = await getT();
  const db = await database();
  if (!db) return loggedOut(t);
  if (!id.safeParse(ruleId).success) return unexpected(t);
  return rules.deleteRule(db, ruleId) ? done() : fail(t("errors.rules.gone"));
}

/**
 * Remembers the language chosen in Settings in this browser, or forgets it
 * for "auto", so the browser's own language counts again. Every page,
 * including those Next.js loaded in advance, is drawn again in it.
 */
export async function setLanguageAction(choice: string): Promise<ActionResult> {
  const t = await getT();
  if (!(await isLoggedIn())) return loggedOut(t);
  const pseudo = choice === PSEUDO_LANGUAGE && process.env.NODE_ENV !== "production";
  if (choice !== "auto" && !isLanguage(choice) && !pseudo) return unexpected(t);

  const store = await cookies();
  if (choice === "auto") {
    store.delete(LANGUAGE_COOKIE);
  } else {
    store.set(LANGUAGE_COOKIE, choice, {
      httpOnly: true,
      sameSite: "lax",
      secure: (await headers()).get("x-forwarded-proto") === "https",
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 2,
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
