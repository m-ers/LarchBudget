import { connection } from "next/server";
import { cache } from "react";
import { getDb, type Db } from "@/db";
import * as accounts from "@/db/accounts";
import * as budget from "@/db/budget";
import * as transactions from "@/db/transactions";
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
  return accounts.getAccounts(await database());
}

export async function getTransactions(options: { only?: "to-sort"; limit: number }) {
  return transactions.listTransactions(await database(), options);
}

/** Asked for by both the navigation and the transactions page; answered once per request. */
export const getTransactionCounts = cache(async () =>
  transactions.countTransactions(await database()),
);

export async function getCategoryOptions() {
  return transactions.getCategoryOptions(await database());
}

export async function getImportAccounts() {
  return transactions.getImportAccounts(await database());
}
