import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatMoney,
  formatMoneyParts,
  formatMoneyRounded,
  minorUnitDigits,
  parseMoney,
  toInputValue,
} from "./money";

describe("minorUnitDigits", () => {
  it("knows how many decimals a currency has", () => {
    expect(minorUnitDigits("EUR")).toBe(2);
    expect(minorUnitDigits("JPY")).toBe(0);
    expect(minorUnitDigits("KWD")).toBe(3);
  });
});

describe("formatMoney", () => {
  it("formats minor units in the given locale", () => {
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
    expect(formatMoney(-500, "USD", "en-US")).toBe("-$5.00");
    expect(formatMoney(1500, "JPY", "en-US")).toBe("¥1,500");
  });
});

describe("parseMoney", () => {
  const eur = (input: string, locale = "en-US") => parseMoney(input, "EUR", locale);

  it("accepts a dot or a comma as the decimal separator, in any locale", () => {
    for (const locale of ["en-US", "nl-NL"]) {
      expect(eur("12.34", locale)).toBe(1234);
      expect(eur("12,34", locale)).toBe(1234);
      expect(eur("12,3", locale)).toBe(1230);
      expect(eur("12", locale)).toBe(1200);
    }
  });

  it("understands thousands written either way", () => {
    for (const locale of ["en-US", "nl-NL"]) {
      expect(eur("1.234,56", locale)).toBe(123456);
      expect(eur("1,234.56", locale)).toBe(123456);
      expect(eur("1.234.567", locale)).toBe(123456700);
      expect(eur("1,234,567.89", locale)).toBe(123456789);
      expect(eur("-1.200,00", locale)).toBe(-120000);
    }
    expect(eur("1'234.50", "de-CH")).toBe(123450);
  });

  it("lets the locale decide a single separator with three digits after it", () => {
    expect(eur("1.200", "nl-NL")).toBe(120000);
    expect(eur("1,200", "en-US")).toBe(120000);
    // The decimal separator there, and a decimal more than euros have.
    expect(eur("1.200", "en-US")).toBeNull();
    expect(eur("1,200", "nl-NL")).toBeNull();
  });

  it("handles signs and spaces", () => {
    expect(eur("-5")).toBe(-500);
    expect(eur("+5.00")).toBe(500);
    expect(eur(" 1 234,50 ")).toBe(123450);
    expect(eur("\u22125")).toBe(-500);
  });

  it("is exact where floats are not", () => {
    expect(eur("0.29")).toBe(29);
    expect(eur("1.15")).toBe(115);
  });

  it("respects the currency's decimals", () => {
    expect(parseMoney("1500", "JPY", "en-US")).toBe(1500);
    expect(parseMoney("1500.5", "JPY", "en-US")).toBeNull();
    expect(parseMoney("1.234", "KWD", "en-US")).toBe(1234);
  });

  it("refuses what is not an amount, and groups that are not thousands", () => {
    expect(eur("")).toBeNull();
    expect(eur("abc")).toBeNull();
    expect(eur("1e3")).toBeNull();
    expect(eur("12.345")).toBeNull();
    expect(eur("12.00,50")).toBeNull();
    expect(eur("1.2.3,4")).toBeNull();
    expect(eur("1,234.5,6")).toBeNull();
    expect(eur("12345.678", "nl-NL")).toBeNull();
    expect(eur(",50")).toBeNull();
  });
});

describe("formatMoneyRounded", () => {
  it("rounds to whole units", () => {
    expect(formatMoneyRounded(155800, "EUR", "en-US")).toBe("€1,558");
    expect(formatMoneyRounded(155850, "EUR", "en-US")).toBe("€1,559");
    expect(formatMoneyRounded(0, "EUR", "en-US")).toBe("€0");
  });
});

describe("formatMoneyParts", () => {
  it("splits at the decimal separator", () => {
    expect(formatMoneyParts(286500, "EUR", "en-US")).toEqual(["€2,865", ".00"]);
    expect(formatMoneyParts(-12000, "EUR", "en-US")).toEqual(["-€120", ".00"]);
    expect(formatMoneyParts(1500, "JPY", "en-US")).toEqual(["¥1,500", ""]);
  });

  it("always adds back up to the full amount", () => {
    for (const locale of ["en-US", "nl-NL", "de-DE", "fr-FR"]) {
      expect(formatMoneyParts(286550, "EUR", locale).join("")).toBe(
        formatMoney(286550, "EUR", locale),
      );
    }
  });
});

describe("formatAmount", () => {
  it("groups digits and leaves out the currency symbol", () => {
    expect(formatAmount(123456, "EUR", "en-US")).toBe("1,234.56");
    expect(formatAmount(123456, "EUR", "nl-NL")).toBe("1.234,56");
    expect(formatAmount(0, "EUR", "en-US")).toBe("0.00");
  });
});

describe("toInputValue", () => {
  it("round-trips through parseMoney in any locale", () => {
    for (const locale of ["en-US", "nl-NL", "de-CH", "fr-FR", "sv-SE"]) {
      for (const amount of [1, 99, 123456, -250000, 100000000]) {
        expect(parseMoney(toInputValue(amount, "EUR", locale), "EUR", locale)).toBe(amount);
      }
    }
  });

  it("shows zero as an empty field", () => {
    expect(toInputValue(0, "EUR", "en-US")).toBe("");
  });
});
