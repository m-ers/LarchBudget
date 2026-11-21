import { memoize } from "./memoize";

/** A month, written "YYYY-MM". */
export type Month = `${number}-${number}`;

/** A calendar date with no time zone, written "YYYY-MM-DD". */
export type IsoDate = `${number}-${number}-${number}`;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(value: unknown): value is Month {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Today's date in the server's time zone. Set the `TZ` environment variable
 * to your own zone (see the README), or days and months change at the
 * server's midnight instead of yours.
 */
export function today(now = new Date()): IsoDate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` as IsoDate;
}

export function currentMonth(now = new Date()): Month {
  return today(now).slice(0, 7) as Month;
}

/** addMonths("2026-12", 1) -> "2027-01" */
export function addMonths(month: Month, delta: number): Month {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}` as Month;
}

/** How many months `to` is after `from`: monthsBetween("2026-11", "2027-06") -> 7. */
export function monthsBetween(from: Month, to: Month): number {
  const index = (month: Month) => {
    const [year, m] = month.split("-").map(Number);
    return year * 12 + (m - 1);
  };
  return index(to) - index(from);
}

/** First day of the month, e.g. "2026-11-01". */
export function monthStart(month: Month): IsoDate {
  return `${month}-01` as IsoDate;
}

/** Days after today in the given month, or null when it is not the current month. */
export function daysLeftInMonth(month: Month, now = new Date()): number | null {
  if (month !== currentMonth(now)) return null;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

/** Midnight UTC on a date, or on the first of a month: for formatting only. */
function utc(value: Month | IsoDate): Date {
  const [year, month, day = 1] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

const monthFormat = memoize(
  (locale: string) =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }),
);

const dateFormat = memoize(
  (locale: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
);

/**
 * The month label split into parts, so the year can be styled on its own:
 * [{ type: "month", value: "November" }, { type: "literal", value: " " }, { type: "year", value: "2026" }]
 */
export function monthLabelParts(month: Month, locale: string): Intl.DateTimeFormatPart[] {
  return monthFormat(locale).formatToParts(utc(month));
}

/** A month's name without the year, e.g. "November" or "november". */
export function monthName(month: Month, locale: string): string {
  return monthLabelParts(month, locale).find((part) => part.type === "month")?.value ?? "";
}

/** A month for display, e.g. "November 2026" or "november 2026". */
export function formatMonth(month: Month, locale: string): string {
  return monthFormat(locale).format(utc(month));
}

/** A date for display, e.g. "Nov 3, 2026" or "3 nov 2026". */
export function formatDate(date: IsoDate, locale: string): string {
  return dateFormat(locale).format(utc(date));
}
