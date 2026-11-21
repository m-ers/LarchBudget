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
  /**
   * How this account's bank file was read last time (JSON), so the next
   * import of the same layout needs no setting up.
   */
  importMapping: text("import_mapping"),
  /**
   * What the account held at the end of `balanceDate`, in minor units, as
   * entered by its owner. The account's "Starting balance" transaction is
   * kept in step with it: starting balance = this amount minus every other
   * transaction dated on or before `balanceDate`. So importing older history
   * later never changes what the account holds on that date.
   */
  startingBalance: integer("starting_balance"),
  balanceDate: text("balance_date").$type<IsoDate>(),
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
  /**
   * True for an income category (Salary, Benefits). It holds no money:
   * what comes in through it goes to Ready to assign, and it has no group.
   */
  income: integer("income", { mode: "boolean" }).notNull().default(false),
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
    /** True for an account's "Starting balance" transaction; there is at most one per account. */
    starting: integer("starting", { mode: "boolean" }).notNull().default(false),
    /**
     * True for an imported transaction nobody has looked at yet. Choosing a
     * category, or marking it as income or a transfer, clears it.
     */
    toSort: integer("to_sort", { mode: "boolean" }).notNull().default(false),
    /**
     * Fingerprint of an imported row, unique per account, so importing an
     * overlapping file never adds the same transaction twice.
     */
    importId: text("import_id"),
    /** Identifies the import that added this row, so one import can be undone. */
    importBatch: text("import_batch"),
    createdAt,
  },
  (t) => [
    // Both end in `amount`, so balances are summed from the index alone.
    index("transactions_account_date_idx").on(t.accountId, t.date, t.amount),
    index("transactions_category_date_idx").on(t.categoryId, t.date, t.amount),
    // The transaction lists are newest first; these let them stop after one page.
    index("transactions_date_idx").on(t.date),
    index("transactions_to_sort_idx")
      .on(t.date)
      .where(sql`${t.toSort} = 1`),
    uniqueIndex("transactions_account_import_unique").on(t.accountId, t.importId),
  ],
);

/**
 * Fingerprints of imported transactions that were deleted by hand, so a
 * later import of the same bank file does not bring them back.
 */
export const deletedImports = sqliteTable(
  "deleted_imports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    importId: text("import_id").notNull(),
    createdAt,
  },
  (t) => [uniqueIndex("deleted_imports_account_import_unique").on(t.accountId, t.importId)],
);
