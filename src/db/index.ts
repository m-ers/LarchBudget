import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __larchBudgetDb?: Db };

export function databasePath(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "./data/larchbudget.db",
  );
}

/** Opens a database file (or ":memory:") and applies pending migrations. */
export function openDb(file: string): Db {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

/**
 * The app's database, opened on first use (not at import time, so
 * `next build` never touches it).
 */
export function getDb(): Db {
  if (globalForDb.__larchBudgetDb) return globalForDb.__larchBudgetDb;

  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  globalForDb.__larchBudgetDb = openDb(file);
  return globalForDb.__larchBudgetDb;
}
