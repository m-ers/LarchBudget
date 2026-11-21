import type { Metadata } from "next";
import Link from "next/link";
import { getClosedAccounts, getImportAccounts } from "@/app/queries";
import { primaryButton } from "@/components/form";
import { Hero, HeroLead, HeroTitle } from "@/components/hero";
import { ImportWizard } from "@/components/import/import-wizard";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Import from bank" };

// Opening this page waits for the server on purpose: see `layout.tsx`.
export const instant = false;

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
        <Import />
      </section>
    </>
  );
}

async function Import() {
  const accounts = await getImportAccounts();
  const { currency, locale } = getConfig();

  if (accounts.length === 0) {
    const closed = (await getClosedAccounts()).length > 0;
    return (
      <div className="text-muted">
        <p>
          {closed
            ? "Transactions are imported into an account, and all of yours are closed. Reopen one, or add a new one."
            : "Transactions are imported into an account, and you have none yet."}
        </p>
        <Link href="/accounts" className={`${primaryButton} mt-4 inline-block px-3.5 py-2`}>
          {closed ? "Go to Accounts" : "Add an account"}
        </Link>
      </div>
    );
  }

  return <ImportWizard accounts={accounts} currency={currency} locale={locale} />;
}
