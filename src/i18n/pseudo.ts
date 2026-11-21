import type { MessageTree } from "./translate";

/**
 * A made-up language for development: English with accents, a third longer,
 * between brackets: "[Ŕéáďý ţó áššíğñ ····]". Text on screen without them is
 * not translated yet, and text that gets cut off will not fit in a longer
 * language. Choose it in development with the cookie `language=en-XA`.
 */
export const PSEUDO_LANGUAGE = "en-XA";

const accents: Record<string, string> = {
  a: "á",
  c: "ç",
  d: "ď",
  e: "é",
  g: "ğ",
  i: "í",
  l: "ĺ",
  n: "ñ",
  o: "ó",
  r: "ŕ",
  s: "š",
  t: "ţ",
  u: "ú",
  y: "ý",
  z: "ž",
  A: "Á",
  C: "Ç",
  D: "Ď",
  E: "É",
  G: "Ğ",
  I: "Í",
  L: "Ĺ",
  N: "Ñ",
  O: "Ó",
  R: "Ŕ",
  S: "Š",
  T: "Ţ",
  U: "Ú",
  Y: "Ý",
  Z: "Ž",
};

function pseudo(text: string): string {
  // Placeholders and tags stay as they are.
  const accented = text
    .split(/(\{\{[^}]*\}\}|<\/?\w+>)/)
    .map((part, index) => (index % 2 ? part : part.replace(/[a-zA-Z]/g, (c) => accents[c] ?? c)))
    .join("");
  const letters = text.replace(/\{\{[^}]*\}\}|<\/?\w+>/g, "").length;
  return `[${accented} ${"·".repeat(Math.max(1, Math.round(letters / 3)))}]`;
}

export function pseudoMessages(messages: MessageTree): MessageTree {
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [
      key,
      typeof value === "string" ? pseudo(value) : pseudoMessages(value),
    ]),
  );
}
