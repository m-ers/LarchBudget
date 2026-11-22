import { addMonths, type Month } from "./dates";

/**
 * Ready to assign taken apart for one month M, as a sum that adds up to it
 * exactly:
 *
 *     leftOver          money that counts for the months before M, less
 *                       everything assigned in them
 *   + received          what the income categories received for M
 *   + withoutCategory   all other money that counts for M
 *   − assigned          assigned in M
 *   − assignedLater     assigned in the months after M
 *   + alreadyIn         money that is in already but counts for a month after M
 *   = Ready to assign
 *
 * "Money" is every transaction outside the visible expense categories: in an
 * income category, without a category (to sort, a transfer, a starting
 * balance) or in an archived category. Each one counts for the month of its
 * date, except in an income category that counts for the next month, where
 * it counts for the month after. "Assigned" is what was assigned to the
 * visible expense categories. Each transaction and each assignment is in
 * exactly one part, which is why the parts add up.
 */
export type ReadyBreakdown = {
  leftOver: number;
  /** The same as what the income categories received for the month. */
  received: number;
  withoutCategory: number;
  /** The same as what was assigned to the categories in the month. */
  assigned: number;
  assignedLater: number;
  alreadyIn: number;
  /** Whether some of `alreadyIn` counts for a month after the next one. */
  beyondNextMonth: boolean;
};

/** Money outside the visible expense categories that came in during one month. */
export type MoneyIn = {
  /** The month of its date. */
  month: Month;
  amount: number;
  /** Whether it came in through a visible income category. */
  income: boolean;
  /** Whether that income category counts for the next month. */
  nextMonth: boolean;
};

/** What was assigned to the visible expense categories in one month. */
export type AssignedIn = { month: Month; amount: number };

/** The month money counts for: the month it came in, or the one after for income that counts for the next month. */
export function countsFor(money: MoneyIn): Month {
  return money.income && money.nextMonth ? addMonths(money.month, 1) : money.month;
}

/**
 * Takes Ready to assign apart for `month`, from all the money outside the
 * visible expense categories and everything assigned to them. The parts add
 * up to that money less those assignments, which is Ready to assign.
 */
export function splitReadyToAssign(
  month: Month,
  money: readonly MoneyIn[],
  assigned: readonly AssignedIn[],
): ReadyBreakdown {
  const nextMonth = addMonths(month, 1);
  const parts: ReadyBreakdown = {
    leftOver: 0,
    received: 0,
    withoutCategory: 0,
    assigned: 0,
    assignedLater: 0,
    alreadyIn: 0,
    beyondNextMonth: false,
  };
  let beyond = 0;

  // Months are written "YYYY-MM", so comparing them as text puts them in order.
  for (const m of money) {
    const counts = countsFor(m);
    if (counts < month) parts.leftOver += m.amount;
    else if (counts > month) {
      parts.alreadyIn += m.amount;
      if (counts > nextMonth) beyond += m.amount;
    } else if (m.income) parts.received += m.amount;
    else parts.withoutCategory += m.amount;
  }
  for (const a of assigned) {
    if (a.month < month) parts.leftOver -= a.amount;
    else if (a.month > month) parts.assignedLater += a.amount;
    else parts.assigned += a.amount;
  }
  return { ...parts, beyondNextMonth: beyond !== 0 };
}

/** The parts of the sum, in order, by name. */
export type ReadyPart =
  "leftOver" | "received" | "withoutCategory" | "assigned" | "assignedLater" | "alreadyIn";

/** A line of the sum: a part, with the amount it adds to Ready to assign (negative: takes away). */
export type ReadyLine = { part: ReadyPart; amount: number };

/** 0 for 0, so that taking nothing away does not give -0. */
const minus = (amount: number) => (amount === 0 ? 0 : -amount);

/**
 * The lines of the sum, in order. Left over, received and assigned are
 * always there; the other parts only when they are not zero. Their amounts
 * add up to Ready to assign.
 */
export function readyLines(breakdown: ReadyBreakdown): ReadyLine[] {
  const lines: (ReadyLine & { always?: boolean })[] = [
    { part: "leftOver", amount: breakdown.leftOver, always: true },
    { part: "received", amount: breakdown.received, always: true },
    { part: "withoutCategory", amount: breakdown.withoutCategory },
    { part: "assigned", amount: minus(breakdown.assigned), always: true },
    { part: "assignedLater", amount: minus(breakdown.assignedLater) },
    { part: "alreadyIn", amount: breakdown.alreadyIn },
  ];
  return lines
    .filter((line) => line.always || line.amount !== 0)
    .map(({ part, amount }) => ({ part, amount }));
}
