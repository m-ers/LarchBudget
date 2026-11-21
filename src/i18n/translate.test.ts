import { describe, expect, it } from "vitest";
import { createTranslator, withFallback, type MessageKey, type MessageTree } from "./translate";

const messages: MessageTree = {
  greeting: "Hello {{name}}",
  rows_one: "{{count}} row",
  rows_other: "{{count}} rows",
  nested: { deeper: { text: "Deep" } },
  sum: "{{a}} and {{a}} make {{b}}",
};
// Keys of this made-up file are not in en.json.
const key = (k: string) => k as MessageKey;

describe("createTranslator", () => {
  const t = createTranslator("en", messages, "en-US");

  it("finds nested keys and fills in values", () => {
    expect(t(key("nested.deeper.text"))).toBe("Deep");
    expect(t(key("greeting"), { name: "Ann" })).toBe("Hello Ann");
    expect(t(key("sum"), { a: 1, b: 2 })).toBe("1 and 1 make 2");
  });

  it("chooses the plural form the language needs", () => {
    expect(t(key("rows"), { count: 1 })).toBe("1 row");
    expect(t(key("rows"), { count: 0 })).toBe("0 rows");
    expect(t(key("rows"), { count: 2 })).toBe("2 rows");
  });

  it("uses the other form when the language's own form is missing", () => {
    // Polish says "2 wiersze" (few) but "5 wierszy" (many).
    const pl = createTranslator(
      "pl",
      {
        rows_one: "{{count}} wiersz",
        rows_few: "{{count}} wiersze",
        rows_other: "{{count}} wierszy",
      },
      "pl-PL",
    );
    expect(pl(key("rows"), { count: 2 })).toBe("2 wiersze");
    expect(pl(key("rows"), { count: 5 })).toBe("5 wierszy");
  });

  it("writes numbers in the budget's number format", () => {
    expect(t(key("rows"), { count: 19999 })).toBe("19,999 rows");
    expect(createTranslator("en", messages, "nl-NL")(key("rows"), { count: 19999 })).toBe(
      "19.999 rows",
    );
  });

  it("leaves a placeholder without a value, and returns an unknown key as it is", () => {
    expect(t(key("greeting"))).toBe("Hello {{name}}");
    expect(t(key("no.such.key"))).toBe("no.such.key");
  });
});

describe("withFallback", () => {
  it("fills in English where a language has no text of its own", () => {
    const english: MessageTree = { a: "A", group: { b: "B", c: "C" } };
    expect(withFallback({ group: { b: "Bé" } }, english)).toEqual({
      a: "A",
      group: { b: "Bé", c: "C" },
    });
  });
});
