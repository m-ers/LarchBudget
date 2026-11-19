import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { accountTypes } from "../lib/account-types";
import type { IsoDate, Month } from "../lib/dates";

const createdAt = integer("created_at", { mode: "timestamp" })
  .notNull()
  .default(sql`(unixepoch())`);

/** A real-world place where money lives. The whole budget uses one currency. */
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: accountTypes }).notNull().default("checking"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt,
});

/** A named section of the budget, e.g. "Fixed costs" or "Goals". */
export const categoryGroups = sqliteTable("category_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * Index into the fixed group palette (src/lib/group-colors.ts), chosen once
   * when the group is created so a group never changes colour. Null when all
   * palette colours are in use.
   */
  colorSlot: integer("color_slot"),
  createdAt,
});

/** A purpose you set money aside for, e.g. "Groceries" or "Holiday". */
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Null only for an archived category whose group was deleted since. */
  groupId: integer("group_id").references(() => categoryGroups.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt,
});

/**
 * Money put into a category in a given month. A category's balance is all
 * its assignments plus all its transactions, so leftovers roll over.
 */
export const assignments = sqliteTable(
  "assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").$type<Month>().notNull(),
    /** Minor units (cents). Negative when money was taken back out. */
    amount: integer("amount").notNull(),
    createdAt,
  },
  (t) => [uniqueIndex("assignments_category_month_unique").on(t.categoryId, t.month)],
);

/**
 * The ledger. Account balances are never stored; they are the sum of an
 * account's transactions. A transaction without a category counts towards
 * "Ready to assign" (income adds to it, uncategorised spending reduces it).
 */
export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    date: text("date").$type<IsoDate>().notNull(),
    /** Minor units (cents). Negative = money out, positive = money in. */
    amount: integer("amount").notNull(),
    payee: text("payee"),
    note: text("note"),
    createdAt,
  },
  (t) => [
    // Both end in `amount`, so balances are summed from the index alone.
    index("transactions_account_date_idx").on(t.accountId, t.date, t.amount),
    index("transactions_category_date_idx").on(t.categoryId, t.date, t.amount),
  ],
);
