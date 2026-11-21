import type { Metadata } from "next";
import localFont from "next/font/local";
import { TranslationProvider } from "@/i18n/client";
import { getLanguage, getMessages, getT } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import "./globals.css";

// Instrument Sans (SIL Open Font License), bundled so no font is fetched at runtime.
const instrumentSans = localFont({
  src: "../../node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-instrument",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: "LarchBudget", template: "%s · LarchBudget" },
    description: t("app.description"),
  };
}

/**
 * Every page is in the language of the request (see `src/i18n/server.ts`),
 * so no page is drawn before a request comes in. Pages wait for the request
 * already: see `src/app/(app)/layout.tsx`.
 */
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const language = await getLanguage();
  return (
    <html lang={language} className={`${instrumentSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TranslationProvider
          language={language}
          messages={await getMessages()}
          numberLocale={getConfig().locale}
        >
          {children}
        </TranslationProvider>
      </body>
    </html>
  );
}
