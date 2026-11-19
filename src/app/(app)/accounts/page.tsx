import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountForm } from "@/components/accounts/account-form";
import { getAccounts } from "@/app/queries";
import { Hero, HeroFigure, HeroLead, HeroTitle, PageSkeleton } from "@/components/hero";
import { accountTypeLabels } from "@/lib/account-types";
import { getConfig } from "@/lib/config";
import { formatAmount, formatMoney, formatMoneyParts } from "@/lib/money";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Accounts />
    </Suspense>
  );
}

async function Accounts() {
  const accounts = await getAccounts();
  const { currency, locale } = getConfig();
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);

  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>Accounts</HeroTitle>
          <HeroLead>Where your money is.</HeroLead>
        </div>
        <HeroFigure label="In all accounts" amount={formatMoneyParts(total, currency, locale)} />
      </Hero>

      <div className="flex flex-1 items-start gap-3">
        <section className="min-w-0 flex-1 self-stretch rounded-2xl border border-line bg-surface px-2.5 pt-1.5 pb-2.5">
          {accounts.length === 0 ? (
            <p className="max-w-xl px-3.5 py-5 text-muted">
              No accounts yet. Add the accounts your money is in, with what is in them today.
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-[12.5px] text-muted">
                  <th scope="col" className="h-[38px] pl-3.5 text-left font-medium">
                    Account
                  </th>
                  <th scope="col" className="w-40 text-left font-medium">
                    Type
                  </th>
                  <th scope="col" className="w-40 pr-3.5 text-right font-medium">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="data-row">
                    <td className="h-[43px] pl-3.5 text-[15.5px] font-medium">{account.name}</td>
                    <td className="text-muted">{accountTypeLabels[account.type]}</td>
                    <td className="pr-3.5 text-right font-semibold tabular-nums">
                      {formatMoney(account.balance, currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="w-80 shrink-0 rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 font-semibold">Add an account</h2>
          <AccountForm amountPlaceholder={formatAmount(0, currency, locale)} />
        </section>
      </div>
    </>
  );
}
