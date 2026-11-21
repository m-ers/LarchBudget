import type { Metadata } from "next";
import { Hero, HeroLead, HeroTitle } from "@/components/hero";
import { LanguageSetting } from "@/components/settings/language-setting";
import { languages } from "@/i18n/languages";
import { PSEUDO_LANGUAGE } from "@/i18n/pseudo";
import { getBrowserLanguage, getLanguageChoice, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("settings.title") };
}

// Opening this page waits for the server on purpose: see `layout.tsx`.
export const instant = false;

export default async function SettingsPage() {
  const t = await getT();
  const options = Object.entries(languages).map(([code, { name }]) => ({ code, name }));
  if (process.env.NODE_ENV !== "production") {
    // The made-up language for checking translations (src/i18n/pseudo.ts).
    options.push({ code: PSEUDO_LANGUAGE, name: "Pseudo (en-XA)" }); // i18n-ignore
  }
  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>{t("settings.title")}</HeroTitle>
          <HeroLead>{t("settings.lead")}</HeroLead>
        </div>
      </Hero>
      <section className="flex-1 rounded-2xl border border-line bg-surface p-6">
        <div className="max-w-xs">
          <LanguageSetting
            choice={await getLanguageChoice()}
            automatic={languages[await getBrowserLanguage()].name}
            options={options}
          />
        </div>
      </section>
    </>
  );
}
