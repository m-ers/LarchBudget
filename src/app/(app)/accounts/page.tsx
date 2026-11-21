import type { Metadata } from "next";
import { getAccounts, getClosedAccounts } from "@/app/queries";
import { AccountForm } from "@/components/accounts/account-form";
import { AccountRow } from "@/components/accounts/account-row";
import { ClosedAccounts } from "@/components/accounts/closed-accounts";
import { Hero, HeroFigure, HeroLead, HeroTitle } from "@/components/hero";
import { getT } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import { today } from "@/lib/dates";
import { formatAmount, formatMoney, formatMoneyParts, toInputValue } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("accounts.title") };
}

// Opening this page waits for the server on purpose: see `layout.tsx`.
export const instant = false;

export default async function AccountsPage() {
  const [accounts, closed] = await Promise.all([getAccounts(), getClosedAccounts()]);
  const t = await getT();
  const { currency, locale } = getConfig();
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);
  const now = today();
  const amountPlaceholder = formatAmount(0, currency, locale);

  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>{t("accounts.title")}</HeroTitle>
          <HeroLead>{t("accounts.lead")}</HeroLead>
        </div>
        <HeroFigure
          label={t("accounts.total")}
          amount={formatMoneyParts(total, currency, locale)}
        />
      </Hero>

      <div className="flex flex-1 items-start gap-3">
        <section className="min-w-0 flex-1 self-stretch rounded-2xl border border-line bg-surface px-2.5 pt-1.5 pb-2.5">
          {accounts.length === 0 ? (
            <p className="max-w-xl px-3.5 py-5 text-muted">
              {closed.length === 0 ? t("accounts.empty") : t("accounts.allClosed")}
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-[12.5px] text-muted">
                  <th scope="col" className="h-[38px] pl-3.5 text-left font-medium">
                    {t("accounts.table.account")}
                  </th>
                  <th scope="col" className="w-40 text-left font-medium">
                    {t("accounts.table.type")}
                  </th>
                  <th scope="col" className="w-56 pr-3.5 text-right font-medium">
                    {t("accounts.table.balance")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    id={account.id}
                    name={account.name}
                    type={account.type}
                    balance={formatMoney(account.balance, currency, locale)}
                    startingBalance={toInputValue(account.startingBalance ?? 0, currency, locale)}
                    balanceDate={account.balanceDate ?? now}
                    transactionCount={account.transactionCount}
                    amountPlaceholder={amountPlaceholder}
                    today={now}
                  />
                ))}
              </tbody>
            </table>
          )}
          {closed.length > 0 && <ClosedAccounts accounts={closed} />}
        </section>

        <section
          aria-labelledby="add-account"
          className="w-80 shrink-0 rounded-2xl border border-line bg-surface p-5"
        >
          <h2 id="add-account" className="mb-4 font-semibold">
            {t("accounts.add.title")}
          </h2>
          <AccountForm amountPlaceholder={amountPlaceholder} today={now} />
        </section>
      </div>
    </>
  );
}
