import { toMinorUnits } from "../money";

/**
 * Reads an amount as a bank writes it ("1.234,56", "-12.50", "€ 12,50",
 * "(5.00)", "12,50-") into minor units, exactly. Returns null when the text
 * is not an amount.
 *
 * With a single separator the meaning can be ambiguous ("1.234"). For a
 * currency with two decimals, a lone separator followed by exactly three
 * digits is read as a thousands separator.
 */
export function parseBankAmount(raw: string, digits: number): number | null {
  let text = raw.replace(/[\s\u00a0\u202f']/g, "").replace(/\u2212/g, "-");
  if (text === "") return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  // A currency symbol or three-letter code, before or after the number.
  text = text.replace(/^(?:[A-Za-z]{3}|[€$£¥])/, "").replace(/(?:[A-Za-z]{3}|[€$£¥])$/, "");
  if (/[+-]$/.test(text)) {
    if (text.endsWith("-")) negative = !negative;
    text = text.slice(0, -1);
  }
  if (/^[+-]/.test(text)) {
    if (text.startsWith("-")) negative = !negative;
    text = text.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(text) && !/^[.,]\d+$/.test(text)) return null;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let decimalAt = -1;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot !== -1 || lastComma !== -1) {
    const at = Math.max(lastDot, lastComma);
    const separator = text[at];
    const occurrences = text.split(separator).length - 1;
    const after = text.length - at - 1;
    const looksLikeThousands = occurrences > 1 || (after === 3 && digits !== 3);
    if (!looksLikeThousands) decimalAt = at;
  }

  const whole = (decimalAt === -1 ? text : text.slice(0, decimalAt)).replace(/[.,]/g, "") || "0";
  let fraction = decimalAt === -1 ? "" : text.slice(decimalAt + 1);
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) return null;

  // More decimals than the currency has are only fine when they are zeros.
  if (fraction.length > digits) {
    if (/[1-9]/.test(fraction.slice(digits))) return null;
    fraction = fraction.slice(0, digits);
  }

  const value = toMinorUnits(whole, fraction, digits);
  if (value === null) return null;
  return negative && value !== 0 ? -value : value;
}
