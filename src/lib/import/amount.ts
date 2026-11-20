import { toMinorUnits } from "../money";

/**
 * Reads an amount as a bank writes it ("1.234,56", "-12.50", "€ 12,50",
 * "(5.00)", "12,50-") into minor units, exactly. Returns null when the text
 * is not an amount.
 *
 * With a single separator the meaning can be ambiguous ("1.234"). A lone
 * separator followed by exactly three digits is a thousands separator only
 * when one to three digits without a leading zero stand before it: "1.234"
 * is 1,234 and "12.500" is 12,500, which in a bank file is the likelier
 * reading. Anything else ("0.500", "1234.500") is a decimal separator, and
 * the extra decimals are dropped when they are zeros; "0.505" is refused.
 * A currency with three decimals always reads it as decimals.
 */
export function parseBankAmount(raw: string, digits: number): number | null {
  let text = raw.replace(/[\s\u00a0\u202f']/g, "").replace(/\u2212/g, "-");
  if (text === "") return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  // The sign may stand before or after the currency ("-$12.50", "$-12.50",
  // "12.50-", "12.50-EUR"), but only once.
  const currency = "(?:[A-Za-z]{3}|[€$£¥])";
  const lead = new RegExp(`^([+-])?${currency}?([+-])?`).exec(text)!;
  text = text.slice(lead[0].length);
  const trail = new RegExp(`([+-])?${currency}?([+-])?$`).exec(text)!;
  text = text.slice(0, text.length - trail[0].length);
  const signs = [lead[1], lead[2], trail[1], trail[2]].filter(Boolean);
  if (signs.length > 1) return null;
  if (signs[0] === "-") negative = !negative;
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
    const looksLikeThousands =
      occurrences > 1 || (after === 3 && digits !== 3 && /^[1-9]\d{0,2}$/.test(text.slice(0, at)));
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
