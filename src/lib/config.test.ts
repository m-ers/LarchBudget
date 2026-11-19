import { describe, expect, it } from "vitest";
import { resolveCurrency, resolveLocale } from "./config";

describe("resolveCurrency", () => {
  it("accepts a currency code in any case", () => {
    expect(resolveCurrency("usd")).toBe("USD");
    expect(resolveCurrency(" JPY ")).toBe("JPY");
  });

  it("falls back to EUR when the setting is missing or not a code", () => {
    expect(resolveCurrency(undefined)).toBe("EUR");
    expect(resolveCurrency("")).toBe("EUR");
    expect(resolveCurrency("EURO")).toBe("EUR");
    expect(resolveCurrency("€")).toBe("EUR");
  });
});

describe("resolveLocale", () => {
  it("accepts a locale and the underscore form of it", () => {
    expect(resolveLocale("nl-NL")).toBe("nl-NL");
    expect(resolveLocale("nl_NL")).toBe("nl-NL");
    expect(resolveLocale("de")).toBe("de");
  });

  it("falls back to en-US when the setting is missing or not a locale", () => {
    expect(resolveLocale(undefined)).toBe("en-US");
    expect(resolveLocale("")).toBe("en-US");
    expect(resolveLocale("not a locale")).toBe("en-US");
    expect(resolveLocale("nl_NL.UTF-8")).toBe("en-US");
  });
});
