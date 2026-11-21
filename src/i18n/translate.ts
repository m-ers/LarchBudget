/**
 * Turns a key such as `budget.title` into the text of one language. Free of
 * React and Next.js, so it runs anywhere and is unit tested on its own.
 *
 * Message files use the i18next format, which translation tools know:
 *
 * - `{{name}}` is filled in from `values`; numbers are written in the
 *   number format of the budget (the LOCALE setting).
 * - A text that depends on a number has one key per plural form, such as
 *   `rows_one` and `rows_other` in English. Pass `count` and the form the
 *   language needs is chosen (see `Intl.PluralRules`).
 * - `<b>…</b>` and other named tags mark parts that look different; the
 *   React side fills them in (see `rich.tsx`).
 */
import type en from "./messages/en.json";

export type MessageTree = { [key: string]: string | MessageTree };
export type Values = Record<string, string | number>;

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

type PluralForm = "zero" | "one" | "two" | "few" | "many" | "other";
type WithoutPluralForm<K> = K extends `${infer Base}_${PluralForm}` ? Base : K;

/** Every key in `en.json`, with plural forms under one name: `rows`, not `rows_one`. */
export type MessageKey = WithoutPluralForm<Leaves<typeof en>>;

export type Translate = {
  /** The text for `key`, with `values` filled in. */
  (key: MessageKey, values?: Values): string;
  /** The text for `key` as written in the file, in the plural form `count` needs. */
  template(key: MessageKey, count?: number): string;
  /** Fills `{{name}}` placeholders in `text` from `values`. */
  fill(text: string, values?: Values): string;
};

function lookup(messages: MessageTree, key: string): string | undefined {
  let node: string | MessageTree | undefined = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * A translator for one language. `messages` should already hold English for
 * every text the language has no translation for (see `withFallback`).
 */
export function createTranslator(
  language: string,
  messages: MessageTree,
  numberLocale: string,
): Translate {
  const plurals = new Intl.PluralRules(language);
  const numbers = new Intl.NumberFormat(numberLocale);

  const template = (key: string, count?: number) =>
    (count === undefined
      ? undefined
      : (lookup(messages, `${key}_${plurals.select(count)}`) ??
        lookup(messages, `${key}_other`))) ??
    lookup(messages, key) ??
    // en.json has every key (the type checker sees to that), so this only
    // happens for a key built at runtime that does not exist.
    key;

  const fill = (text: string, values?: Values) =>
    values
      ? text.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, name: string) => {
          const value = values[name];
          if (value === undefined) return placeholder;
          return typeof value === "number" ? numbers.format(value) : value;
        })
      : text;

  const count = (values?: Values) => (typeof values?.count === "number" ? values.count : undefined);
  const t = ((key, values) => fill(template(key, count(values)), values)) as Translate;
  t.template = template;
  t.fill = fill;
  return t;
}

/** `messages` with English filled in wherever it has no text of its own. */
export function withFallback(messages: MessageTree, english: MessageTree): MessageTree {
  const merged: MessageTree = { ...english };
  for (const [key, value] of Object.entries(messages)) {
    const base = english[key];
    merged[key] =
      typeof value === "object" && typeof base === "object" ? withFallback(value, base) : value;
  }
  return merged;
}
