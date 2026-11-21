import type { Metadata } from "next";
import Link from "next/link";
import { getClosedAccounts, getImportAccounts } from "@/app/queries";
import { primaryButton } from "@/components/form";
import { Hero, HeroLead, HeroTitle } from "@/components/hero";
import { ImportWizard } from "@/components/import/import-wizard";
import { getT } from "@/i18n/server";
import { getConfig } from "@/lib/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("import.page.title") };
}

// Opening this page waits for the server on purpose: see `layout.tsx`.
export const instant = false;

export default async function ImportPage() {
  const t = await getT();
  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>{t("import.page.title")}</HeroTitle>
          <HeroLead className="max-w-xl">{t("import.page.lead")}</HeroLead>
        </div>
      </Hero>
      <section className="flex-1 rounded-2xl border border-line bg-surface p-6">
        <Import />
      </section>
    </>
  );
}

async function Import() {
  const t = await getT();
  const accounts = await getImportAccounts();
  const { currency, locale } = getConfig();

  if (accounts.length === 0) {
    const closed = (await getClosedAccounts()).length > 0;
    return (
      <div className="text-muted">
        <p>{closed ? t("import.page.noAccountClosed") : t("import.page.noAccountNone")}</p>
        <Link href="/accounts" className={`${primaryButton} mt-4 inline-block px-3.5 py-2`}>
          {closed ? t("import.page.goToAccounts") : t("import.page.addAccount")}
        </Link>
      </div>
    );
  }

  return <ImportWizard accounts={accounts} currency={currency} locale={locale} />;
}
