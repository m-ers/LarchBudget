import { and, eq, sql } from "drizzle-orm";
import { MAX_RULE_TEXT_LENGTH, MAX_RULES } from "../lib/limits";
import { buildMatcher, cleanRuleText, comparable, type MatchableRule } from "../lib/rules";
import { categoryOpen } from "./budget";
import type { Db } from "./index";
import { categories, sortingRules, transactions } from "./schema";

/**
 * Sorting rules: "a payee or note that contains FRESH MARKET goes to
 * Groceries". A rule is applied when a bank file is imported, and when a
 * rule is saved, to what is still to sort. It never changes a transaction
 * that someone sorted, changed or split, and never splits one.
 *
 * Like the rest of `src/db`, these functions take the database as an
 * argument and never touch Next.js, so they can be unit tested.
 */

/** Where a rule sends a transaction: a category, or "ready" for no category on purpose. */
export type RuleTarget = number | "ready";

const categoryOf = (target: RuleTarget): number | null => (target === "ready" ? null : target);

export type Rule = {
  id: number;
  text: string;
  categoryId: number | null;
  /** The category's name, also when it has since been archived; null for no category. */
  category: string | null;
  /** The category is archived: the rule waits, and sorts nothing until it is changed. */
  categoryArchived: boolean;
  /** How many transactions it sorted that nobody has changed since. */
  sorted: number;
};

/** Every rule, in the order of their texts. */
export function listRules(db: Db): Rule[] {
  return db
    .all<{
      id: number;
      text: string;
      category_id: number | null;
      name: string | null;
      archived: number | null;
      sorted: number;
    }>(
      sql`
      SELECT r.id, r.text, r.category_id, c.name, c.archived,
        (SELECT count(*) FROM transactions t WHERE t.rule_id = r.id) AS sorted
      FROM sorting_rules r
      LEFT JOIN categories c ON c.id = r.category_id
      ORDER BY lower(r.text), r.id
    `,
    )
    .map((row) => ({
      id: row.id,
      text: row.text,
      categoryId: row.category_id,
      category: row.name,
      categoryArchived: row.archived === 1,
      sorted: row.sorted,
    }));
}

/** The rules that can sort something now: those whose category is not archived. */
export function usableRules(db: Db): MatchableRule[] {
  return db
    .select({ id: sortingRules.id, text: sortingRules.text, categoryId: sortingRules.categoryId })
    .from(sortingRules)
    .leftJoin(categories, eq(categories.id, sortingRules.categoryId))
    .where(sql`${sortingRules.categoryId} IS NULL OR ${categories.archived} = 0`)
    .all();
}

/**
 * Sorts what is still to sort with the rules. With `only`, just the
 * transactions that fit that rule; each still goes where the best fitting
 * rule of all sends it. Returns how many were sorted.
 */
function sortWaiting(db: Db, only?: MatchableRule): number {
  const findRule = buildMatcher(usableRules(db));
  const fits = only ? buildMatcher([only]) : null;
  const waiting = db
    .select({ id: transactions.id, payee: transactions.payee, note: transactions.note })
    .from(transactions)
    .where(and(eq(transactions.toSort, true), eq(transactions.starting, false)))
    .all();
  let sorted = 0;
  for (const row of waiting) {
    if (fits && !fits(row.payee, row.note)) continue;
    const rule = findRule(row.payee, row.note);
    if (!rule) continue;
    db.update(transactions)
      .set({ categoryId: rule.categoryId, toSort: false, ruleId: rule.id })
      .where(eq(transactions.id, row.id))
      .run();
    sorted += 1;
  }
  return sorted;
}

export type RuleProblem =
  "empty" | "too-long" | "text-taken" | "no-category" | "too-many" | "no-rule";

/** Whether another rule already looks for this text (ignoring capitals and spaces). */
function textTaken(db: Db, text: string, exceptId?: number): boolean {
  const wanted = comparable(text);
  return db
    .select({ id: sortingRules.id, text: sortingRules.text })
    .from(sortingRules)
    .all()
    .some((rule) => rule.id !== exceptId && comparable(rule.text) === wanted);
}

/** The rule's text as it will be kept, or why it cannot be used. */
function checkText(
  db: Db,
  text: string,
  exceptId?: number,
): { text: string } | { problem: RuleProblem } {
  const clean = cleanRuleText(text);
  if (clean === "") return { problem: "empty" };
  if (clean.length > MAX_RULE_TEXT_LENGTH) return { problem: "too-long" };
  return textTaken(db, clean, exceptId) ? { problem: "text-taken" } : { text: clean };
}

/**
 * Makes a rule, and sorts the transactions still to sort that it fits.
 * Returns its id and how many that was, or why it could not be made.
 */
export function createRule(
  db: Db,
  text: string,
  target: RuleTarget,
): { id: number; sorted: number } | RuleProblem {
  return db.transaction((tx) => {
    const checked = checkText(tx, text);
    if ("problem" in checked) return checked.problem;
    const clean = checked.text;
    if (typeof target === "number" && !categoryOpen(tx, target)) return "no-category";
    if (tx.select({ id: sortingRules.id }).from(sortingRules).all().length >= MAX_RULES) {
      return "too-many";
    }
    const { id } = tx
      .insert(sortingRules)
      .values({ text: clean, categoryId: categoryOf(target) })
      .returning({ id: sortingRules.id })
      .get();
    return { id, sorted: sortWaiting(tx, { id, text: clean, categoryId: categoryOf(target) }) };
  });
}

/**
 * Changes a rule's text and where it sends transactions, and applies the
 * change:
 * - what the rule sorted before, and nobody changed since, goes to the new
 *   category too; what no longer fits the text stays where it is, as
 *   someone's choice from now on;
 * - what is still to sort and now fits is sorted.
 * A rule whose category was archived may keep it. Returns how many
 * transactions the rule sorted or moved just now, or why it could not change.
 */
export function updateRule(
  db: Db,
  id: number,
  text: string,
  target: RuleTarget,
): { sorted: number } | RuleProblem {
  return db.transaction((tx) => {
    const [rule] = tx.select().from(sortingRules).where(eq(sortingRules.id, id)).all();
    if (!rule) return "no-rule";
    const checked = checkText(tx, text, id);
    if ("problem" in checked) return checked.problem;
    const clean = checked.text;
    const categoryId = categoryOf(target);
    const changed = categoryId !== rule.categoryId;
    if (changed && typeof target === "number" && !categoryOpen(tx, target)) {
      return "no-category";
    }

    tx.update(sortingRules).set({ text: clean, categoryId }).where(eq(sortingRules.id, id)).run();

    let moved = 0;
    if (clean !== rule.text || changed) {
      const fits = buildMatcher([{ id, text: clean, categoryId }]);
      const earlier = tx
        .select({ id: transactions.id, payee: transactions.payee, note: transactions.note })
        .from(transactions)
        .where(eq(transactions.ruleId, id))
        .all();
      for (const row of earlier) {
        if (!fits(row.payee, row.note)) {
          tx.update(transactions).set({ ruleId: null }).where(eq(transactions.id, row.id)).run();
        } else if (changed) {
          tx.update(transactions).set({ categoryId }).where(eq(transactions.id, row.id)).run();
          moved += 1;
        }
      }
    }
    return { sorted: moved + sortWaiting(tx, { id, text: clean, categoryId }) };
  });
}

/**
 * Deletes a rule. What it sorted stays where it is, no longer marked as the
 * rule's work. Returns false when there is no such rule.
 */
export function deleteRule(db: Db, id: number): boolean {
  return db.delete(sortingRules).where(eq(sortingRules.id, id)).run().changes > 0;
}
