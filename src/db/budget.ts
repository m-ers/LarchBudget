import { and, eq, sql } from "drizzle-orm";
import type { AccountType } from "../lib/account-types";
import { addMonths, monthStart, type IsoDate, type Month } from "../lib/dates";
import { groupColors } from "../lib/group-colors";
import type { Db } from "./index";
import { accounts, assignments, categories, categoryGroups, transactions } from "./schema";

/**
 * Budget maths. Everything here is derived from two facts: the ledger
 * (transactions) and what was assigned to each category per month.
 *
 * The rule that keeps it honest:
 *
 *   money in all accounts = Ready to assign + balance of every category
 *
 * So every cent is either in a category or waiting to be assigned.
 *
 * These functions take the database as an argument and never touch Next.js,
 * so they can be unit tested. `queries.ts` wraps them for use in pages.
 *
 * A function that changes something checks its own preconditions and says
 * what happened in its return value; callers only turn that into a message.
 */

/** Heading for categories without a group. The app never creates one; this covers a hand-edited database. */
export const UNGROUPED = "Ungrouped";

export type CategoryRow = {
  id: number;
  name: string;
  /** Assigned in the viewed month. */
  assigned: number;
  /** Net transactions in the viewed month (negative = spent). */
  activity: number;
  /** Balance at the end of the viewed month, including earlier months. */
  available: number;
  /**
   * Balance over all time, including later months: what archiving the
   * category gives back to Ready to assign.
   */
  balance: number;
};

export type GroupRow = {
  /** Null for the fallback section holding categories without a group. */
  id: number | null;
  name: string;
  colorSlot: number | null;
  categories: CategoryRow[];
  /** Sums over its categories, with the same meaning as theirs. */
  assigned: number;
  activity: number;
  available: number;
};

export type BudgetMonth = {
  groups: GroupRow[];
  /** Over all visible categories. `spent` is the activity as a positive amount, never below zero. */
  totals: { assigned: number; spent: number; available: number };
  /** Money in accounts that is not in any category, across all time. */
  readyToAssign: number;
  hasAccounts: boolean;
};

export function getBudgetMonth(db: Db, month: Month): BudgetMonth {
  const start = monthStart(month);
  const next = monthStart(addMonths(month, 1));

  const rows = db.all<{
    id: number;
    group_id: number | null;
    name: string;
    assigned: number;
    assigned_through: number;
    assigned_total: number;
    activity: number;
    activity_through: number;
    activity_total: number;
  }>(sql`
    SELECT
      c.id,
      c.group_id,
      c.name,
      coalesce((SELECT sum(a.amount) FROM assignments a
                WHERE a.category_id = c.id AND a.month = ${month}), 0) AS assigned,
      coalesce((SELECT sum(a.amount) FROM assignments a
                WHERE a.category_id = c.id AND a.month <= ${month}), 0) AS assigned_through,
      coalesce((SELECT sum(a.amount) FROM assignments a
                WHERE a.category_id = c.id), 0) AS assigned_total,
      coalesce((SELECT sum(t.amount) FROM transactions t
                WHERE t.category_id = c.id AND t.date >= ${start} AND t.date < ${next}), 0) AS activity,
      coalesce((SELECT sum(t.amount) FROM transactions t
                WHERE t.category_id = c.id AND t.date < ${next}), 0) AS activity_through,
      coalesce((SELECT sum(t.amount) FROM transactions t
                WHERE t.category_id = c.id), 0) AS activity_total
    FROM categories c
    WHERE c.archived = 0
    ORDER BY c.sort_order, c.id
  `);

  const [{ total: moneyInAccounts, count: accountCount }] = db.all<{
    total: number;
    count: number;
  }>(sql`
    SELECT
      coalesce((SELECT sum(amount) FROM transactions), 0) AS total,
      (SELECT count(*) FROM accounts) AS count
  `);

  const byGroup = new Map<number | null, CategoryRow[]>();
  const list: CategoryRow[] = rows.map((r) => {
    const row = {
      id: r.id,
      name: r.name,
      assigned: r.assigned,
      activity: r.activity,
      available: r.assigned_through + r.activity_through,
      balance: r.assigned_total + r.activity_total,
    };
    byGroup.set(r.group_id, [...(byGroup.get(r.group_id) ?? []), row]);
    return row;
  });

  const toGroup = (id: number | null, name: string, colorSlot: number | null): GroupRow => {
    const members = byGroup.get(id) ?? [];
    return {
      id,
      name,
      colorSlot,
      categories: members,
      assigned: members.reduce((sum, c) => sum + c.assigned, 0),
      activity: members.reduce((sum, c) => sum + c.activity, 0),
      available: members.reduce((sum, c) => sum + c.available, 0),
    };
  };

  const groups = db
    .select()
    .from(categoryGroups)
    .orderBy(categoryGroups.sortOrder, categoryGroups.id)
    .all()
    .map((g) => toGroup(g.id, g.name, g.colorSlot));
  if (byGroup.has(null)) groups.push(toGroup(null, UNGROUPED, null));

  const inCategories = rows.reduce((sum, r) => sum + r.assigned_total + r.activity_total, 0);

  return {
    groups,
    totals: {
      assigned: list.reduce((sum, c) => sum + c.assigned, 0),
      spent: Math.max(0, -list.reduce((sum, c) => sum + c.activity, 0)),
      available: list.reduce((sum, c) => sum + c.available, 0),
    },
    readyToAssign: moneyInAccounts - inCategories,
    hasAccounts: accountCount > 0,
  };
}

/**
 * Sets the amount assigned to a category for one month (0 clears it).
 * Returns false, and changes nothing, when the category does not exist or is
 * archived.
 */
export function setAssigned(db: Db, categoryId: number, month: Month, amount: number): boolean {
  return db.transaction((tx) => {
    const category = tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.archived, false)))
      .all();
    if (category.length === 0) return false;

    if (amount === 0) {
      tx.delete(assignments)
        .where(and(eq(assignments.categoryId, categoryId), eq(assignments.month, month)))
        .run();
    } else {
      tx.insert(assignments)
        .values({ categoryId, month, amount })
        .onConflictDoUpdate({
          target: [assignments.categoryId, assignments.month],
          set: { amount },
        })
        .run();
    }
    return true;
  });
}

/** True when a visible category other than `exceptId` already uses this name (case-insensitive). */
function categoryNameTaken(db: Db, name: string, exceptId?: number): boolean {
  const rows = db.all<{ id: number }>(sql`
    SELECT id FROM categories
    WHERE archived = 0 AND lower(name) = lower(${name})
  `);
  return rows.some((r) => r.id !== exceptId);
}

/** True when a group other than `exceptId` already uses this name (case-insensitive). */
function groupNameTaken(db: Db, name: string, exceptId?: number): boolean {
  const rows = db.all<{ id: number }>(
    sql`SELECT id FROM category_groups WHERE lower(name) = lower(${name})`,
  );
  return rows.some((r) => r.id !== exceptId);
}

/** Creates a category at the end of a group. Returns its id, or why it was not created. */
export function createCategory(
  db: Db,
  name: string,
  groupId: number,
): number | "name-taken" | "no-group" {
  return db.transaction((tx) => {
    const group = tx.select().from(categoryGroups).where(eq(categoryGroups.id, groupId)).all();
    if (group.length === 0) return "no-group";
    if (categoryNameTaken(tx, name)) return "name-taken";

    const [{ next }] = tx.all<{ next: number }>(
      sql`SELECT coalesce(max(sort_order), 0) + 1 AS next FROM categories`,
    );
    return tx.insert(categories).values({ name, groupId, sortOrder: next }).returning().get().id;
  });
}

/** Renames a category. Returns false, and changes nothing, when another visible category has the name. */
export function renameCategory(db: Db, id: number, name: string): boolean {
  return db.transaction((tx) => {
    if (categoryNameTaken(tx, name, id)) return false;
    tx.update(categories).set({ name }).where(eq(categories.id, id)).run();
    return true;
  });
}

/**
 * Hides a category. Its balance returns to Ready to assign, and its past
 * transactions stay in the ledger.
 */
export function archiveCategory(db: Db, id: number): void {
  db.update(categories).set({ archived: true }).where(eq(categories.id, id)).run();
}

/**
 * Creates a group and gives it the first palette colour no other group uses.
 * Returns its id, or "name-taken".
 */
export function createGroup(db: Db, name: string): number | "name-taken" {
  return db.transaction((tx) => {
    if (groupNameTaken(tx, name)) return "name-taken";

    const existing = tx.select().from(categoryGroups).all();
    const used = new Set(existing.map((g) => g.colorSlot));
    const free = groupColors.findIndex((_, slot) => !used.has(slot));
    const sortOrder = Math.max(0, ...existing.map((g) => g.sortOrder)) + 1;
    return tx
      .insert(categoryGroups)
      .values({ name, sortOrder, colorSlot: free === -1 ? null : free })
      .returning()
      .get().id;
  });
}

/** Renames a group. Returns false, and changes nothing, when another group has the name. */
export function renameGroup(db: Db, id: number, name: string): boolean {
  return db.transaction((tx) => {
    if (groupNameTaken(tx, name, id)) return false;
    tx.update(categoryGroups).set({ name }).where(eq(categoryGroups.id, id)).run();
    return true;
  });
}

/**
 * Deletes a group. Its categories are archived in the same step, exactly as
 * when each is archived by hand: their money goes back to Ready to assign
 * and their history stays.
 */
export function deleteGroup(db: Db, id: number): void {
  db.transaction((tx) => {
    // Archived categories keep their history but lose the group.
    tx.update(categories)
      .set({ archived: true, groupId: null })
      .where(eq(categories.groupId, id))
      .run();
    tx.delete(categoryGroups).where(eq(categoryGroups.id, id)).run();
  });
}

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

/** Creates an account. A starting balance is recorded as its first transaction. */
export function createAccount(
  db: Db,
  input: { name: string; type: AccountType; startingBalance: number; date: IsoDate },
): number {
  return db.transaction((tx) => {
    const { id } = tx
      .insert(accounts)
      .values({ name: input.name, type: input.type })
      .returning()
      .get();
    if (input.startingBalance !== 0) {
      tx.insert(transactions)
        .values({
          accountId: id,
          date: input.date,
          amount: input.startingBalance,
          payee: "Starting balance",
        })
        .run();
    }
    return id;
  });
}
