import { isMonth, type IsoDate, type Month } from "./dates";

/** What the "All" list is narrowed to. Every part is optional. */
export type TransactionFilter = {
  /** Matches the payee or the note, ignoring case. */
  q?: string;
  accountId?: number;
  /** A category id, or "none" for transactions without one. */
  category?: number | "none";
  month?: Month;
};

/** Where a page of the list starts: just after this transaction, going back in time. */
export type Cursor = { date: IsoDate; id: number };

export type TransactionsAddress = {
  showAll: boolean;
  before?: Cursor;
  filter: TransactionFilter;
};

type Params = Record<string, string | string[] | undefined>;

export const MAX_SEARCH_LENGTH = 100;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[1-9]\d{0,8}$/;

const first = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : value?.[0];

const readId = (value: string | undefined) =>
  value !== undefined && ID_PATTERN.test(value) ? Number(value) : undefined;

/**
 * Reads the address of the transactions page. Anything that does not make
 * sense is left out, so a mangled link shows the list unfiltered instead of
 * an error.
 */
export function readAddress(params: Params): TransactionsAddress {
  const showAll = first(params.show) === "all";

  const [date, id] = first(params.before)?.split("_") ?? [];
  const beforeId = readId(id);
  const before =
    date !== undefined && DATE_PATTERN.test(date) && beforeId !== undefined
      ? { date: date as IsoDate, id: beforeId }
      : undefined;

  // Filtering belongs to the "All" list; "To sort" is already short.
  const filter: TransactionFilter = {};
  if (showAll) {
    const q = first(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
    if (q) filter.q = q;
    const accountId = readId(first(params.account));
    if (accountId !== undefined) filter.accountId = accountId;
    const category = first(params.category);
    if (category === "none") filter.category = "none";
    else if (readId(category) !== undefined) filter.category = Number(category);
    const month = first(params.month);
    if (isMonth(month)) filter.month = month;
  }
  return { showAll, before, filter };
}

/** The address for a list, the opposite of `readAddress`. */
export function transactionsHref({ showAll, before, filter }: TransactionsAddress): string {
  const query = new URLSearchParams();
  if (showAll) query.set("show", "all");
  if (filter.q) query.set("q", filter.q);
  if (filter.accountId !== undefined) query.set("account", String(filter.accountId));
  if (filter.category !== undefined) query.set("category", String(filter.category));
  if (filter.month) query.set("month", filter.month);
  if (before) query.set("before", `${before.date}_${before.id}`);
  const text = query.toString();
  return text ? `/transactions?${text}` : "/transactions";
}
