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

/** The character a locale groups thousands with: "," in en-US, "." in nl-NL. */
const groupSeparator = memoize(
  (locale: string) =>
    new Intl.NumberFormat(locale).formatToParts(12345).find((part) => part.type === "group")
      ?.value ?? ",",
);

/**
 * Parses an amount someone typed into minor units, or null when it is not
 * one. A dot and a comma are both understood, as the decimal separator or
 * between thousands, so "12.50", "12,50", "1.234,56", "1,234.56" and
 * "1 234,50" all work whatever the locale:
 * - with both, the last one is the decimal separator;
 * - one that appears more than once is between thousands ("1.234.567");
 * - a single one is the decimal separator, unless exactly three digits
 *   follow it and the locale groups thousands with it: "1.200" is 1200 in
 *   nl-NL, and in en-US has a decimal more than euros have, so it is refused.
 * Thousands come in groups of three, so a slip like "12.00,50" is refused
 * instead of guessed at.
 */
export function parseMoney(input: string, currency: string, locale: string): number | null {
  const cleaned = input.replace(/[\s\u00a0\u202f'\u2019]/g, "").replace("\u2212", "-");
  const match = /^([+-])?(\d[\d.,]*)$/.exec(cleaned);
  if (!match) return null;
  const [, sign, number] = match;

  let whole = number;
  let fraction = "";
  let group: string | null = null;
  const lastDot = number.lastIndexOf(".");
  const lastComma = number.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    const at = Math.max(lastDot, lastComma);
    [whole, fraction] = [number.slice(0, at), number.slice(at + 1)];
    group = number[at] === "." ? "," : ".";
  } else if (lastDot !== -1 || lastComma !== -1) {
    const separator = lastDot !== -1 ? "." : ",";
    const parts = number.split(separator);
    if (parts.length > 2 || (parts[1].length === 3 && separator === groupSeparator(locale))) {
      group = separator;
    } else {
      [whole, fraction] = parts;
    }
  }
  if (group !== null) {
    const grouped = group === "." ? /^\d{1,3}(\.\d{3})*$/ : /^\d{1,3}(,\d{3})*$/;
    if (!grouped.test(whole)) return null;
    whole = whole.replaceAll(group, "");
  }
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) return null;

  const value = toMinorUnits(whole, fraction, minorUnitDigits(currency));
  if (value === null) return null;
  return sign === "-" ? -value : value;
}
