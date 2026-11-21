import { currentMonth, isMonth, monthsBetween, type Month } from "./dates";

/**
 * A category's target: what it should get, so the budget can say what still
 * has to be assigned in a month. Only expense categories have one.
 *
 * - "monthly": the amount every month, such as Rent €1,100. What is left at
 *   the end of a month builds up.
 * - "topUp": every month starts with the amount in the category, such as
 *   Groceries €400. What was left at the end of the month before counts
 *   towards it.
 * - "byMonth": the amount by the end of a month, such as Holiday €1,200 by
 *   June 2027, spread evenly over the months until then.
 *
 * The kinds are stored in `categories.target_kind`, so never rename one.
 */
export const targetKinds = ["monthly", "topUp", "byMonth"] as const;

export type TargetKind = (typeof targetKinds)[number];

export type Target =
  { kind: "monthly" | "topUp"; amount: number } | { kind: "byMonth"; amount: number; month: Month };

export function isTargetKind(value: unknown): value is TargetKind {
  return targetKinds.includes(value as TargetKind);
}

/**
 * A target from what is stored, or null for none. Columns that do not make a
 * target together, as a hand-edited database could hold, count as none.
 */
export function readTarget(
  kind: string | null,
  amount: number | null,
  month: string | null,
): Target | null {
  const target =
    kind === "byMonth" ? { kind, amount, month } : { kind, amount: amount as number | null };
  return isTarget(target) ? target : null;
}

/** Whether a value is a target that can be stored: a kind, an amount above zero, and a month for "by a month". */
export function isTarget(value: unknown): value is Target {
  if (typeof value !== "object" || value === null) return false;
  const { kind, amount, month } = value as Record<string, unknown>;
  if (!isTargetKind(kind) || !Number.isSafeInteger(amount) || (amount as number) <= 0) return false;
  return kind === "byMonth" ? isMonth(month) : month === undefined;
}

/** What a category held at the end of the month before: its Available, without this month's assigned and activity. */
export function heldBefore(category: {
  assigned: number;
  activity: number;
  available: number;
}): number {
  return category.available - category.assigned - category.activity;
}

/**
 * What a target still needs in `month`, in minor units, never below zero:
 *
 * - monthly: the amount, minus what is assigned in the month;
 * - topUp: the amount, minus what the category held at the end of the month
 *   before, minus what is assigned in the month. Spending during the month
 *   does not raise it;
 * - byMonth: what is still missing at the start of the month, spread evenly
 *   over the months left up to and including the target's month, rounded up
 *   to a whole cent, minus what is assigned in the month. Nothing after the
 *   target's month.
 *
 * Targets ask for money only in the current month (`thisMonth`, which
 * follows TZ) and later months: a month that is over needs nothing.
 */
export function targetNeeds(
  {
    target,
    month,
    heldBefore,
    assigned,
  }: {
    target: Target | null;
    /** The month on screen. */
    month: Month;
    /** What the category held at the end of the month before `month`: its Available then. */
    heldBefore: number;
    /** What is assigned to it in `month`. */
    assigned: number;
  },
  thisMonth: Month = currentMonth(),
): number {
  if (!target || month < thisMonth) return 0;
  return Math.max(0, wanted(target, month, heldBefore) - assigned);
}

/** What a target asks of `month` before anything is assigned in it; may be zero or below. */
function wanted(target: Target, month: Month, heldBefore: number): number {
  switch (target.kind) {
    case "monthly":
      return target.amount;
    case "topUp":
      return target.amount - heldBefore;
    case "byMonth": {
      if (month > target.month) return 0;
      const missing = target.amount - heldBefore;
      if (missing <= 0) return 0;
      // Exact for whole numbers up to Number.MAX_SAFE_INTEGER: the quotient
      // is never closer to a whole number than 1 / monthsLeft, much more
      // than the rounding of the division can move it.
      const monthsLeft = monthsBetween(month, target.month) + 1;
      return Math.ceil(missing / monthsLeft);
    }
  }
}

/**
 * What a category's target needs in `month`, from the figures the budget
 * shows for it. The server and the page both work it out with this, so a
 * change shows the same need before and after it is saved.
 */
export function categoryNeeds(
  category: { target: Target | null; assigned: number; activity: number; available: number },
  month: Month,
  thisMonth: Month = currentMonth(),
): number {
  return targetNeeds(
    {
      target: category.target,
      month,
      heldBefore: heldBefore(category),
      assigned: category.assigned,
    },
    thisMonth,
  );
}
