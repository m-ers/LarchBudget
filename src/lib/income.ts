import { addMonths, pad, type IsoDate, type Month } from "./dates";

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
 * The days whose money an income category counts as received in `month`:
 * the month itself, or, for a category that counts for the next month, the
 * whole month before. A salary paid on 25 October, or on 2 October, then
 * counts for November.
 */
export function receivedPeriod(month: Month, countsForNextMonth: boolean): Period {
  const from = countsForNextMonth ? addMonths(month, -1) : month;
  return { first: date(from, 1), last: lastDay(from) };
}
