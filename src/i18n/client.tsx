"use client";

import { createContext, use, useMemo } from "react";
import { createTranslator, type MessageTree, type Translate } from "./translate";

type Setup = { language: string; messages: MessageTree; numberLocale: string };

const TranslationContext = createContext<Setup | null>(null);

/** Gives Client Components the texts of the page's language (see the root layout). */
export function TranslationProvider({ children, ...setup }: Setup & { children: React.ReactNode }) {
  const { language, messages, numberLocale } = setup;
  const value = useMemo(
    () => ({ language, messages, numberLocale }),
    [language, messages, numberLocale],
  );
  return <TranslationContext value={value}>{children}</TranslationContext>;
}

/** For Client Components: `const t = useT()`. */
export function useT(): Translate {
  const setup = use(TranslationContext);
  if (!setup) throw new Error("useT needs a TranslationProvider above it.");
  const { language, messages, numberLocale } = setup;
  return useMemo(
    () => createTranslator(language, messages, numberLocale),
    [language, messages, numberLocale],
  );
}
