import { memoize } from "./memoize";

/**
 * Money is stored as an integer number of minor units (cents for EUR/USD,
 * whole yen for JPY) so arithmetic is exact. Never use floats for amounts.
 */

/** Number of decimal places a currency uses (2 for EUR, 0 for JPY, 3 for KWD). */
export const minorUnitDigits = memoize(
  (currency: string): number =>
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2,
);

/** Minor units as the decimal number the formatters expect. For display only. */
const toMajor = (minorUnits: number, currency: string) =>
  minorUnits / 10 ** minorUnitDigits(currency);

const moneyFormat = memoize(
  (locale: string, currency: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }),
);

const roundedFormat = memoize(
  (locale: string, currency: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }),
);

/** A plain number with the currency's decimals: grouped for reading, ungrouped for typing. */
const plainFormat = memoize(
  (locale: string, currency: string, grouping: "grouped" | "ungrouped") => {
    const digits = minorUnitDigits(currency);
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: grouping === "grouped",
    });
  },
);

/** Formats minor units for display, e.g. (123456, "EUR", "nl-NL") -> "€ 1.234,56". */
export function formatMoney(minorUnits: number, currency: string, locale: string): string {
  return moneyFormat(locale, currency).format(toMajor(minorUnits, currency));
}

/** Formats minor units rounded to whole units, for summaries: 155800 -> "€1,558". */
export function formatMoneyRounded(minorUnits: number, currency: string, locale: string): string {
  return roundedFormat(locale, currency).format(toMajor(minorUnits, currency));
}

/**
 * Like `formatMoney`, split at the decimal separator so the cents can be
 * styled more quietly: (286500, "EUR", "en-US") -> ["€2,865", ".00"].
 */
export function formatMoneyParts(
  minorUnits: number,
  currency: string,
  locale: string,
): [whole: string, rest: string] {
  const parts = moneyFormat(locale, currency).formatToParts(toMajor(minorUnits, currency));
  const split = parts.findIndex((p) => p.type === "decimal");
  const join = (list: Intl.NumberFormatPart[]) => list.map((p) => p.value).join("");
  return split === -1 ? [join(parts), ""] : [join(parts.slice(0, split)), join(parts.slice(split))];
}

/** Formats minor units as a plain grouped number without a currency symbol, e.g. "1,234.56". */
export function formatAmount(minorUnits: number, currency: string, locale: string): string {
  return plainFormat(locale, currency, "grouped").format(toMajor(minorUnits, currency));
}

/**
 * The value to put in an amount input: no grouping, so `parseMoney` reads it
 * back unchanged. Zero becomes an empty field.
 */
export function toInputValue(minorUnits: number, currency: string, locale: string): string {
  if (minorUnits === 0) return "";
  return plainFormat(locale, currency, "ungrouped").format(toMajor(minorUnits, currency));
}

/**
 * Combines the digits before and after the decimal separator into minor
 * units, exactly. Null when there are more decimals than the currency has or
 * the amount is too large to hold exactly.
 */
export function toMinorUnits(whole: string, fraction: string, digits: number): number | null {
  if (fraction.length > digits) return null;
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0");
  return minor > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(minor);
}

/**
 * Parses user input such as "12.34", "12,34", "-5" or "1 234,50" into minor
 * units. Returns null when the input is not a valid amount. Thousands
 * separators other than spaces are rejected instead of guessed at.
 */
export function parseMoney(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s\u00a0\u202f]/g, "").replace("\u2212", "-");
  const match = /^([+-])?(\d+)(?:[.,](\d+))?$/.exec(cleaned);
  if (!match) return null;

  const [, sign, whole, fraction = ""] = match;
  const value = toMinorUnits(whole, fraction, minorUnitDigits(currency));
  if (value === null) return null;
  return sign === "-" ? -value : value;
}
