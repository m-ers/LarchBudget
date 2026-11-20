import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { addMonths, monthStart, type Month } from "../lib/dates";
import { groupColors } from "../lib/group-colors";
import type { Db } from "./index";
import { assignments, categories, categoryGroups } from "./schema";

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
  /** Money in accounts that is not in any category, across all time: `inAccounts - inCategories`. */
  readyToAssign: number;
  /** All the money in all accounts. */
  inAccounts: number;
  /** What all visible categories hold together, over all time. */
  inCategories: number;
  hasAccounts: boolean;
  /** Whether anything was assigned to a visible category in the month before. */
  assignedLastMonth: boolean;
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

  const [{ total: moneyInAccounts, count: accountCount, assignedLastMonth }] = db.all<{
    total: number;
    count: number;
    assignedLastMonth: number;
  }>(sql`
    SELECT
      coalesce((SELECT sum(amount) FROM transactions), 0) AS total,
      (SELECT count(*) FROM accounts) AS count,
      EXISTS (SELECT 1 FROM assignments a JOIN categories c ON c.id = a.category_id
              WHERE c.archived = 0 AND a.month = ${addMonths(month, -1)}) AS assignedLastMonth
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
    inAccounts: moneyInAccounts,
    inCategories,
    hasAccounts: accountCount > 0,
    assignedLastMonth: assignedLastMonth === 1,
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
    writeAssigned(tx, categoryId, month, amount);
    return true;
  });
}

/** Stores what is assigned to a category in a month; nothing is stored for 0. */
function writeAssigned(db: Db, categoryId: number, month: Month, amount: number): void {
  if (amount === 0) {
    db.delete(assignments)
      .where(and(eq(assignments.categoryId, categoryId), eq(assignments.month, month)))
      .run();
  } else {
    db.insert(assignments)
      .values({ categoryId, month, amount })
      .onConflictDoUpdate({
        target: [assignments.categoryId, assignments.month],
        set: { amount },
      })
      .run();
  }
}

/**
 * Gives every visible category that has nothing assigned in month `to` what
 * it had assigned in month `from`. Returns how many it filled in.
 */
export function copyAssignments(db: Db, from: Month, to: Month): number {
  return db.transaction((tx) => {
    const copies = tx.all<{ categoryId: number; amount: number }>(sql`
      SELECT a.category_id AS categoryId, a.amount
      FROM assignments a JOIN categories c ON c.id = a.category_id
      WHERE a.month = ${from} AND c.archived = 0 AND c.income = 0
        AND NOT EXISTS (SELECT 1 FROM assignments b
                        WHERE b.category_id = a.category_id AND b.month = ${to})
    `);
    for (const { categoryId, amount } of copies) writeAssigned(tx, categoryId, to, amount);
    return copies.length;
  });
}

/** One end of moving money: a category, or "ready" for Ready to assign. */
export type MoneyEnd = number | "ready";

/**
 * Moves money in one month. The giving category's Assigned amount goes
 * down by `amount` and the receiving one's goes up, so Ready to assign
 * stays as it is. With Ready to assign at one end, only the category at
 * the other end changes, and Ready to assign moves the other way.
 *
 * Refuses an amount that is not above zero, a move to the same place, and
 * archived or income categories, which hold no money to move.
 */
export function moveMoney(
  db: Db,
  { from, to, month, amount }: { from: MoneyEnd; to: MoneyEnd; month: Month; amount: number },
): "moved" | "no-category" | "not-positive" | "same" {
  if (!Number.isSafeInteger(amount) || amount <= 0) return "not-positive";
  if (from === to) return "same";
  return db.transaction((tx) => {
    const ends = [from, to].filter((end) => end !== "ready");
    const found = tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          inArray(categories.id, ends),
          eq(categories.archived, false),
          eq(categories.income, false),
        ),
      )
      .all();
    if (found.length !== ends.length) return "no-category";

    const assigned = (categoryId: number) =>
      tx
        .select({ amount: assignments.amount })
        .from(assignments)
        .where(and(eq(assignments.categoryId, categoryId), eq(assignments.month, month)))
        .all()[0]?.amount ?? 0;
    if (from !== "ready") writeAssigned(tx, from, month, assigned(from) - amount);
    if (to !== "ready") writeAssigned(tx, to, month, assigned(to) + amount);
    return "moved";
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

/** Which way a category or group moves in its list. */
export type Direction = "up" | "down";

/** What came of moving something up or down: moved, not there, or already first or last. */
export type MoveResult = "moved" | "gone" | "at-edge";

/**
 * The order of `ids` once `id` has swapped places with its neighbour, or
 * null when it has no neighbour that way.
 */
function swapped(ids: number[], id: number, direction: Direction): number[] | null {
  const at = ids.indexOf(id);
  const other = at + (direction === "up" ? -1 : 1);
  if (other < 0 || other >= ids.length) return null;
  const order = [...ids];
  [order[at], order[other]] = [order[other], order[at]];
  return order;
}

/**
 * Swaps a category with the visible category above or below it in the same
 * group. The group's categories are then numbered 1, 2, 3…, so two that
 * shared a place (possible in a hand-edited database) still change places.
 */
export function moveCategory(db: Db, id: number, direction: Direction): MoveResult {
  return db.transaction((tx) => {
    const [category] = tx
      .select({ groupId: categories.groupId, income: categories.income })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.archived, false)))
      .all();
    if (!category) return "gone";

    const inGroup = tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          category.groupId === null
            ? isNull(categories.groupId)
            : eq(categories.groupId, category.groupId),
          eq(categories.income, category.income),
          eq(categories.archived, false),
        ),
      )
      .orderBy(categories.sortOrder, categories.id)
      .all();
    const order = swapped(
      inGroup.map((c) => c.id),
      id,
      direction,
    );
    if (!order) return "at-edge";
    order.forEach((categoryId, i) =>
      tx
        .update(categories)
        .set({ sortOrder: i + 1 })
        .where(eq(categories.id, categoryId))
        .run(),
    );
    return "moved";
  });
}

/** Swaps a group with the one above or below it, like `moveCategory`. */
export function moveGroup(db: Db, id: number, direction: Direction): MoveResult {
  return db.transaction((tx) => {
    const groups = tx
      .select({ id: categoryGroups.id })
      .from(categoryGroups)
      .orderBy(categoryGroups.sortOrder, categoryGroups.id)
      .all();
    if (!groups.some((g) => g.id === id)) return "gone";
    const order = swapped(
      groups.map((g) => g.id),
      id,
      direction,
    );
    if (!order) return "at-edge";
    order.forEach((groupId, i) =>
      tx
        .update(categoryGroups)
        .set({ sortOrder: i + 1 })
        .where(eq(categoryGroups.id, groupId))
        .run(),
    );
    return "moved";
  });
}

/**
 * Puts a category at the end of another group. Its assignments and
 * transactions stay with it, so nothing changes in the figures but the
 * groups' totals.
 */
export function moveCategoryToGroup(
  db: Db,
  id: number,
  groupId: number,
): "moved" | "no-category" | "no-group" {
  return db.transaction((tx) => {
    const category = tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(eq(categories.id, id), eq(categories.archived, false), eq(categories.income, false)),
      )
      .all();
    if (category.length === 0) return "no-category";
    const group = tx.select().from(categoryGroups).where(eq(categoryGroups.id, groupId)).all();
    if (group.length === 0) return "no-group";

    const [{ next }] = tx.all<{ next: number }>(
      sql`SELECT coalesce(max(sort_order), 0) + 1 AS next FROM categories`,
    );
    tx.update(categories).set({ groupId, sortOrder: next }).where(eq(categories.id, id)).run();
    return "moved";
  });
}

export type ArchivedCategory = {
  id: number;
  name: string;
  /** What it holds over all time: what restoring takes out of Ready to assign again. */
  balance: number;
};

/** Archived categories, by name, with what each would bring back. */
export function getArchivedCategories(db: Db): ArchivedCategory[] {
  return db.all<ArchivedCategory>(sql`
    SELECT
      c.id,
      c.name,
      coalesce((SELECT sum(a.amount) FROM assignments a WHERE a.category_id = c.id), 0)
        + coalesce((SELECT sum(t.amount) FROM transactions t WHERE t.category_id = c.id), 0)
        AS balance
    FROM categories c
    WHERE c.archived = 1
    ORDER BY lower(c.name), c.id
  `);
}

/**
 * Brings an archived category back, with its history and balance, at the
 * end of the group it was in, or of the first group when that one is gone.
 * Refused when a visible category has its name, or when there is no group.
 */
export function restoreCategory(
  db: Db,
  id: number,
): "restored" | "no-category" | "name-taken" | "no-group" {
  return db.transaction((tx) => {
    const [category] = tx.select().from(categories).where(eq(categories.id, id)).all();
    if (!category) return "no-category";
    if (!category.archived) return "restored";
    if (categoryNameTaken(tx, category.name)) return "name-taken";

    const groups = tx
      .select({ id: categoryGroups.id })
      .from(categoryGroups)
      .orderBy(categoryGroups.sortOrder, categoryGroups.id)
      .all();
    const group = groups.find((g) => g.id === category.groupId) ?? groups[0];
    if (!group) return "no-group";

    const [{ next }] = tx.all<{ next: number }>(
      sql`SELECT coalesce(max(sort_order), 0) + 1 AS next FROM categories`,
    );
    tx.update(categories)
      .set({ archived: false, groupId: group.id, sortOrder: next })
      .where(eq(categories.id, id))
      .run();
    return "restored";
  });
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
