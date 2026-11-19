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
  it("accepts a dot or a comma as the decimal separator", () => {
    expect(parseMoney("12.34", "EUR")).toBe(1234);
    expect(parseMoney("12,34", "EUR")).toBe(1234);
    expect(parseMoney("12,3", "EUR")).toBe(1230);
    expect(parseMoney("12", "EUR")).toBe(1200);
  });

  it("handles signs and spaces", () => {
    expect(parseMoney("-5", "EUR")).toBe(-500);
    expect(parseMoney("+5.00", "EUR")).toBe(500);
    expect(parseMoney(" 1 234,50 ", "EUR")).toBe(123450);
  });

  it("is exact where floats are not", () => {
    expect(parseMoney("0.29", "EUR")).toBe(29);
    expect(parseMoney("1.15", "EUR")).toBe(115);
  });

  it("respects the currency's decimals", () => {
    expect(parseMoney("1500", "JPY")).toBe(1500);
    expect(parseMoney("1500.5", "JPY")).toBeNull();
    expect(parseMoney("1.234", "KWD")).toBe(1234);
  });

  it("rejects anything ambiguous or invalid", () => {
    expect(parseMoney("", "EUR")).toBeNull();
    expect(parseMoney("abc", "EUR")).toBeNull();
    expect(parseMoney("1.234,56", "EUR")).toBeNull();
    expect(parseMoney("12.345", "EUR")).toBeNull();
    expect(parseMoney("1e3", "EUR")).toBeNull();
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
        expect(parseMoney(toInputValue(amount, "EUR", locale), "EUR")).toBe(amount);
      }
    }
  });

  it("shows zero as an empty field", () => {
    expect(toInputValue(0, "EUR", "en-US")).toBe("");
  });
});
