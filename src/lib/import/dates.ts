import { pad, type IsoDate } from "../dates";

/** The order of the parts in a bank's date: year-month-day, day-month-year or month-day-year. */
export const dateOrders = ["ymd", "dmy", "mdy"] as const;
export type DateOrder = (typeof dateOrders)[number];

function build(year: number, month: number, day: number): IsoDate | null {
  if (year < 100) year += 2000;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${year}-${pad(month)}-${pad(day)}` as IsoDate;
}

/** The three numbers of a date, in the order written. Any time after the date is ignored. */
function parts(raw: string): [number, number, number] | null {
  const text = raw.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})(?!\d)/.exec(text);
  if (compact) return [Number(compact[1]), Number(compact[2]), Number(compact[3])];
  const split = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?!\d)/.exec(text);
  if (split) return [Number(split[1]), Number(split[2]), Number(split[3])];
  return null;
}

/** Reads a bank's date into YYYY-MM-DD, or null when it is not a real date in that order. */
export function parseBankDate(raw: string, order: DateOrder): IsoDate | null {
  const p = parts(raw);
  if (!p) return null;
  const [a, b, c] = p;
  const startsWithYear = a > 31;
  if (order === "ymd") return startsWithYear ? build(a, b, c) : null;
  if (startsWithYear) return null;
  return order === "dmy" ? build(c, b, a) : build(c, a, b);
}

/** True when the text reads as a date in at least one order. */
export function looksLikeDate(raw: string): boolean {
  return dateOrders.some((order) => parseBankDate(raw, order) !== null);
}

/** How many of the values read as a date in each order. */
function countByOrder(values: string[]): Record<DateOrder, number> {
  const count = (order: DateOrder) =>
    values.filter((value) => parseBankDate(value, order) !== null).length;
  return { ymd: count("ymd"), dmy: count("dmy"), mdy: count("mdy") };
}

/**
 * Day-first and month-first only differ when a number above 12 shows up. True
 * when the values read equally well both ways ("11/03/2026"), so the order is
 * a guess.
 */
export function isDateOrderAmbiguous(values: string[]): boolean {
  const { ymd, dmy, mdy } = countByOrder(values);
  return dmy === mdy && dmy > 0 && ymd < dmy;
}

/**
 * Works out the order from a column of dates. When the file cannot tell,
 * the reader's own habit decides: month first for `monthFirst`, else day first.
 */
export function detectDateOrder(values: string[], monthFirst = false): DateOrder {
  const { ymd, dmy, mdy } = countByOrder(values);
  if (ymd >= dmy && ymd >= mdy && ymd > 0) return "ymd";
  if (mdy === dmy) return monthFirst ? "mdy" : "dmy";
  return mdy > dmy ? "mdy" : "dmy";
}

/** Whether this locale writes the month before the day. Only the US does it among the common ones. */
export function isMonthFirstLocale(locale: string): boolean {
  return locale.toLowerCase() === "en-us";
}
