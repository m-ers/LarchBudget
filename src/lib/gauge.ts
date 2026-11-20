import { formatMoney } from "./money";

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

/**
 * How a category's Available amount adds up, for the gauge's tooltip, e.g.
 * "-€2,200.00 from earlier months + €1,150.00 assigned − €1,100.00 spent".
 * Parts that are zero are left out. For an overspent category it starts
 * with what to do about it.
 */
export function explainAvailable(
  { assigned, activity, available }: { assigned: number; activity: number; available: number },
  currency: string,
  locale: string,
): string {
  const money = (minorUnits: number) => formatMoney(minorUnits, currency, locale);
  const parts = [
    { amount: available - assigned - activity, label: "from earlier months" },
    { amount: assigned, label: "assigned" },
    { amount: activity, label: activity < 0 ? "spent" : "refunded" },
  ].filter((part) => part.amount !== 0);

  const sum =
    parts.length === 0
      ? "Nothing assigned or spent this month."
      : parts
          .map(({ amount, label }, i) =>
            i === 0
              ? `${money(amount)} ${label}`
              : `${amount < 0 ? "−" : "+"} ${money(Math.abs(amount))} ${label}`,
          )
          .join(" ");
  return available < 0 ? `Overspent by ${money(-available)}: assign more to cover it. ${sum}` : sum;
}
