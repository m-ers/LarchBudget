/**
 * The languages LarchBudget speaks. To add one, see "Add your language" in
 * CONTRIBUTING.md: copy `messages/en.json`, translate it, and list it here.
 */
import type { MessageTree } from "./translate";
import en from "./messages/en.json";
import nl from "./messages/nl.json";

export const languages = {
  en: { name: "English", messages: en },
  nl: { name: "Nederlands", messages: nl },
} satisfies Record<string, { name: string; messages: MessageTree }>;

export type Language = keyof typeof languages;

export const defaultLanguage: Language = "en";

/** The cookie that remembers the language chosen in this browser. */
export const LANGUAGE_COOKIE = "language";

export function isLanguage(code: string | undefined): code is Language {
  return code !== undefined && Object.hasOwn(languages, code);
}

/**
 * The language to show: the one chosen in this browser, else the first of
 * the browser's own languages that LarchBudget has, else English.
 * `acceptLanguage` is the browser's Accept-Language header, such as
 * "nl-NL,nl;q=0.9,en;q=0.8".
 */
export function resolveLanguage(
  chosen: string | undefined,
  acceptLanguage: string | null,
): Language {
  if (isLanguage(chosen)) return chosen;
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...parameters] = part.trim().split(";");
      const q = parameters.find((p) => p.trim().startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.trim().slice(2)) : 1, index };
    })
    .filter(({ tag, q }) => tag !== "" && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of wanted) {
    if (isLanguage(tag)) return tag;
    const primary = tag.split("-")[0];
    if (isLanguage(primary)) return primary;
  }
  return defaultLanguage;
}

/**
 * The locale for dates: the words of the language, in the order of the
 * region of the number format. English with LOCALE nl-NL writes
 * "20 Nov 2026", Dutch with LOCALE en-US "20 nov 2026".
 */
export function dateLocale(language: string, numberLocale: string): string {
  const base = new Intl.Locale(language).language;
  const region = new Intl.Locale(numberLocale).region;
  const candidate = region ? `${base}-${region}` : base;
  return Intl.DateTimeFormat.supportedLocalesOf(candidate).length > 0 ? candidate : base;
}
