import type { Month } from "./dates";
import type { Target } from "./targets";

/**
 * How full a category is, for the Available gauge.
 *
 * - "over": more was spent than the category held.
 * - "empty": exactly nothing is left.
 * - "ok": money is left; `left` says what share of what the category held
 *   this month (what is available now plus what was spent this month).
 */
export type GaugeLevel = { state: "over" | "empty" | "ok"; left: number };

/**
 * @param available what the category holds at the end of the month, in minor units
 * @param activity net transactions this month (negative = spent)
 */
export function gaugeLevel(available: number, activity: number): GaugeLevel {
  if (available < 0) return { state: "over", left: 0 };
  if (available === 0) return { state: "empty", left: 0 };
  const spent = Math.max(0, -activity);
  return { state: "ok", left: available / (available + spent) };
}

/** One term of how a category's Available amount adds up. */
export type AvailablePart = {
  kind: "earlier" | "assigned" | "spent" | "refunded";
  /** In minor units; negative when it takes money away. */
  amount: number;
};

/**
 * The category's target, named after the sum: "Target: top up to €400.".
 * For "byMonth", `passed` says whether the viewed month is after its month.
 */
export type TargetPart =
  | { kind: "monthly" | "topUp"; amount: number }
  | { kind: "byMonth"; amount: number; month: Month; passed: boolean };

/**
 * How a category's Available amount adds up, for the gauge's tooltip: for
 * example from earlier months -2,200.00, assigned 1,150.00 and spent
 * -1,100.00. Parts that are zero are left out. `overspentBy` is how much the
 * category is overspent (in minor units, positive), or null when it is not.
 * `target` is the category's target, left out when it has none.
 */
export function explainAvailable(
  {
    assigned,
    activity,
    available,
    target,
  }: {
    assigned: number;
    activity: number;
    available: number;
    target?: Target | null;
  },
  /** The month on screen, to tell whether a "byMonth" target's month has passed. */
  month?: Month,
): { overspentBy: number | null; parts: AvailablePart[]; target?: TargetPart } {
  const parts: AvailablePart[] = [
    { kind: "earlier" as const, amount: available - assigned - activity },
    { kind: "assigned" as const, amount: assigned },
    { kind: activity < 0 ? ("spent" as const) : ("refunded" as const), amount: activity },
  ].filter((part) => part.amount !== 0);
  return {
    overspentBy: available < 0 ? -available : null,
    parts,
    target: !target
      ? undefined
      : target.kind === "byMonth"
        ? { ...target, passed: month !== undefined && month > target.month }
        : target,
  };
}
