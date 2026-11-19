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
