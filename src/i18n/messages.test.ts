/**
 * Checks every language file against en.json. When you add or update a
 * language, `npm test` lists here what is missing or does not match.
 */
import { describe, expect, it } from "vitest";
import { languages } from "./languages";
import type { MessageTree } from "./translate";

const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(tree: MessageTree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string") out.set(prefix + key, value);
    else for (const [k, v] of flatten(value, `${prefix}${key}.`)) out.set(k, v);
  }
  return out;
}

/**
 * The placeholders of a text, without `count`: a language may leave it out
 * of a plural form, as English does in "The transaction in this file…".
 */
const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
    .map((m) => m[1])
    .filter((name) => name !== "count")
    .sort();
const tags = (text: string) => [...text.matchAll(/<\/?(\w+)>/g)].map((m) => m[0]).sort();
const base = (key: string) => key.replace(PLURAL, "");

const english = flatten(languages.en.messages);

describe("en.json", () => {
  it("has no empty texts", () => {
    expect([...english].filter(([, text]) => text.trim() === "").map(([key]) => key)).toEqual([]);
  });

  it("has both English plural forms for every text that has one", () => {
    const plural = new Set([...english.keys()].filter((k) => PLURAL.test(k)).map(base));
    const incomplete = [...plural].filter(
      (k) => !english.has(`${k}_one`) || !english.has(`${k}_other`),
    );
    expect(incomplete).toEqual([]);
  });
});

describe.each(Object.entries(languages).filter(([code]) => code !== "en"))(
  "%s",
  (code, { messages }) => {
    const own = flatten(messages);
    const englishBases = new Set([...english.keys()].map(base));

    it("has no texts that en.json does not have", () => {
      expect([...own.keys()].filter((key) => !englishBases.has(base(key)))).toEqual([]);
    });

    it("keeps the placeholders and tags of the English text", () => {
      const wrong = [...own].filter(([key, text]) => {
        const englishText = english.get(key) ?? english.get(`${base(key)}_other`);
        return (
          englishText !== undefined &&
          (placeholders(text).join() !== placeholders(englishText).join() ||
            tags(text).join() !== tags(englishText).join())
        );
      });
      expect(wrong.map(([key]) => key)).toEqual([]);
    });

    it("has every plural form the language needs", () => {
      const forms = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
      const plural = new Set([...own.keys()].filter((k) => PLURAL.test(k)).map(base));
      const missing = [...plural].flatMap((key) =>
        forms.filter((form) => !own.has(`${key}_${form}`)).map((form) => `${key}_${form}`),
      );
      expect(missing).toEqual([]);
    });
  },
);
