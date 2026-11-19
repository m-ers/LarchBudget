import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getImportAccounts } from "@/app/queries";
import { primaryButton } from "@/components/form";
import { Hero, HeroLead, HeroTitle } from "@/components/hero";
import { ImportWizard } from "@/components/import/import-wizard";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Import from bank" };

export default function ImportPage() {
  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>Import from bank</HeroTitle>
          <HeroLead className="max-w-xl">
            Download your transactions as a CSV file from your bank&apos;s website and add it here.
            Transactions you imported before are skipped, so files may overlap.
          </HeroLead>
        </div>
      </Hero>
      <section className="flex-1 rounded-2xl border border-line bg-surface p-6">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Import />
        </Suspense>
      </section>
    </>
  );
}

async function Import() {
  const accounts = await getImportAccounts();
  const { currency, locale } = getConfig();

  if (accounts.length === 0) {
    return (
      <div className="text-muted">
        <p>Transactions are imported into an account, and you have none yet.</p>
        <Link href="/accounts" className={`${primaryButton} mt-4 inline-block px-3.5 py-2`}>
          Add an account
        </Link>
      </div>
    );
  }

  return <ImportWizard accounts={accounts} currency={currency} locale={locale} />;
}
