import { connection } from "next/server";
import { cache } from "react";
import { getDb, type Db } from "@/db";
import * as budget from "@/db/budget";
import type { Month } from "@/lib/dates";
import { requireLogin } from "./session";

/**
 * Everything a page reads goes through here. Once per request, before the
 * first read, this:
 *
 * - waits for a real request. better-sqlite3 is synchronous, so Next.js would
 *   otherwise run the query once at build time and serve that result forever.
 * - checks the login, so a page never depends on the proxy alone.
 */
const database = cache(async (): Promise<Db> => {
  await connection();
  await requireLogin();
  return getDb();
});

export async function getBudgetMonth(month: Month) {
  return budget.getBudgetMonth(await database(), month);
}

export async function getAccounts() {
  return budget.getAccounts(await database());
}
