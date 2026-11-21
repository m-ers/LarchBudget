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
 * How a category's Available amount adds up, for the gauge's tooltip: for
 * example from earlier months -2,200.00, assigned 1,150.00 and spent
 * -1,100.00. Parts that are zero are left out. `overspentBy` is how much the
 * category is overspent (in minor units, positive), or null when it is not.
 */
export function explainAvailable({
  assigned,
  activity,
  available,
}: {
  assigned: number;
  activity: number;
  available: number;
}): { overspentBy: number | null; parts: AvailablePart[] } {
  const parts: AvailablePart[] = [
    { kind: "earlier" as const, amount: available - assigned - activity },
    { kind: "assigned" as const, amount: assigned },
    { kind: activity < 0 ? ("spent" as const) : ("refunded" as const), amount: activity },
  ].filter((part) => part.amount !== 0);
  return { overspentBy: available < 0 ? -available : null, parts };
}
