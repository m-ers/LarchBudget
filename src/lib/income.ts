import { addMonths, pad, type IsoDate, type Month } from "./dates";

/**
 * The day of the month from which money in an income category that "counts
 * for the next month" does so. A salary paid on the 23rd, 25th or 31st is
 * meant for the next month, and one that slips to the 1st because of a
 * weekend still counts for that same month.
 */
export const NEXT_MONTH_FROM_DAY = 15;

/** The first and last day of a stretch of days, both included. */
export type Period = { first: IsoDate; last: IsoDate };

const date = (month: Month, day: number) => `${month}-${pad(day)}` as IsoDate;

/** The last day of a month, e.g. "2026-02-28". */
function lastDay(month: Month): IsoDate {
  const [year, m] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  return date(month, new Date(Date.UTC(year, m, 0)).getUTCDate());
}

/**
 * The days whose money an income category counts as received in `month`.
 *
 * Normally that is the month itself. For a category that counts for the next
 * month, it is from the 15th of the month before up to and including the
 * 14th of this one: money that arrives on or after the 15th counts for the
 * next month, and money that arrives before it for its own month.
 */
export function receivedPeriod(month: Month, countsForNextMonth: boolean): Period {
  if (!countsForNextMonth) return { first: date(month, 1), last: lastDay(month) };
  return {
    first: date(addMonths(month, -1), NEXT_MONTH_FROM_DAY),
    last: date(month, NEXT_MONTH_FROM_DAY - 1),
  };
}
