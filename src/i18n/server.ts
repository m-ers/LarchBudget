import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getConfig } from "@/lib/config";
import { LANGUAGE_COOKIE, languages, resolveLanguage } from "./languages";
import { PSEUDO_LANGUAGE, pseudoMessages } from "./pseudo";
import { createTranslator, withFallback, type MessageTree } from "./translate";

/**
 * The language of this request: chosen in this browser, else the browser's
 * own, else English. Reading it makes a page wait for the request, which
 * every page does already (see `src/app/(app)/layout.tsx`).
 */
export const getLanguage = cache(async (): Promise<string> => {
  const chosen = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  if (chosen === PSEUDO_LANGUAGE && process.env.NODE_ENV !== "production") return chosen;
  return resolveLanguage(chosen, (await headers()).get("accept-language"));
});

/** The texts of this request's language, with English where it has none. */
export const getMessages = cache(async (): Promise<MessageTree> => {
  const language = await getLanguage();
  const english = languages.en.messages;
  if (language === PSEUDO_LANGUAGE) return pseudoMessages(english);
  return withFallback(languages[language as keyof typeof languages].messages, english);
});

/** For Server Components and Server Actions: `const t = await getT()`. */
export const getT = cache(async () =>
  createTranslator(await getLanguage(), await getMessages(), getConfig().locale),
);
