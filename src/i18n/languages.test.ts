import { describe, expect, it } from "vitest";
import { defaultLanguage, isLanguage, resolveLanguage } from "./languages";

describe("resolveLanguage", () => {
  it("uses the language chosen in this browser", () => {
    expect(resolveLanguage("en", "de-DE")).toBe("en");
  });

  it("ignores a chosen language LarchBudget does not have", () => {
    expect(resolveLanguage("xx", null)).toBe(defaultLanguage);
  });

  it("takes the browser's languages in order of preference", () => {
    expect(resolveLanguage(undefined, "de-DE,de;q=0.9,en;q=0.8")).toBe("en");
    expect(resolveLanguage(undefined, "en-GB;q=0.5,fr;q=0.9")).toBe("en");
  });

  it("matches a regional language to its language", () => {
    expect(resolveLanguage(undefined, "en-AU")).toBe("en");
  });

  it("falls back to English", () => {
    expect(resolveLanguage(undefined, null)).toBe("en");
    expect(resolveLanguage(undefined, "")).toBe("en");
    expect(resolveLanguage(undefined, "ja-JP")).toBe("en");
  });
});

describe("isLanguage", () => {
  it("knows only listed languages", () => {
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("toString")).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });
});
