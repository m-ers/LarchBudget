"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import * as budget from "@/db/budget";
import { accountTypes } from "@/lib/account-types";
import { getConfig } from "@/lib/config";
import { isMonth, today } from "@/lib/dates";
import { MAX_NAME_LENGTH } from "@/lib/limits";
import { parseMoney } from "@/lib/money";
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
const categoryNameTaken = (name: string) => fail(`You already have a category called "${name}".`);
const groupNameTaken = (name: string) => fail(`You already have a group called "${name}".`);

const id = z.number().int().positive();
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

export async function createCategoryAction(groupId: number, input: string): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(groupId).success) return UNEXPECTED;
  const parsed = name.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const result = budget.createCategory(db, parsed.data, groupId);
  if (result === "no-group") return fail("That group no longer exists.");
  if (result === "name-taken") return categoryNameTaken(parsed.data);
  return done();
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

export async function deleteGroupAction(groupId: number): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  if (!id.safeParse(groupId).success) return UNEXPECTED;

  return budget.deleteGroup(db, groupId) ? done() : fail("Archive its categories first.");
}

// ---- Accounts --------------------------------------------------------------

const accountInput = z.object({
  name,
  type: z.enum(accountTypes),
  startingBalance: z.string(),
});

export async function createAccountAction(formData: FormData): Promise<ActionResult> {
  const db = await database();
  if (!db) return LOGGED_OUT;
  const parsed = accountInput.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    startingBalance: formData.get("startingBalance") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const startingBalance = parseAmount(parsed.data.startingBalance);
  if (startingBalance === null) return fail("The starting balance is not an amount.");

  budget.createAccount(db, {
    name: parsed.data.name,
    type: parsed.data.type,
    startingBalance,
    date: today(),
  });
  return done();
}
