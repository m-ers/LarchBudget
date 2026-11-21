import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCategoryOptions,
  getFilterOptions,
  getSuggestions,
  getTransactionCounts,
  getTransactionSummary,
  getTransactions,
} from "@/app/queries";
import { primaryButton } from "@/components/form";
import { Hero, HeroFigure, HeroLead, HeroTitle } from "@/components/hero";
import { CategoryChoicesProvider } from "@/components/transactions/category-choices";
import { CategorySelect } from "@/components/transactions/category-select";
import { DeleteTransaction } from "@/components/transactions/delete-transaction";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { getT } from "@/i18n/server";
import { richText } from "@/i18n/rich";
import { getConfig } from "@/lib/config";
import { formatDate, formatMonth } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { readAddress, transactionsHref } from "@/lib/transactions-address";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("transactions.page.title") };
}

const PAGE_SIZE = 200;

const tab = (active: boolean) =>
  `rounded-[9px] px-3 py-1.5 text-[14.5px] font-medium transition-colors ${
    active ? "bg-ok-track text-ink" : "text-muted hover:bg-hover hover:text-ink"
  }`;

// Opening this page waits for the server on purpose: see `layout.tsx`.
export const instant = false;

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const t = await getT();
  const { showAll, before, filter } = readAddress(await searchParams);

  const [counts, found, groups] = await Promise.all([
    getTransactionCounts(),
    // One more than a page, to know whether there is an older page.
    getTransactions({
      only: showAll ? undefined : "to-sort",
      before,
      filter,
      limit: PAGE_SIZE + 1,
    }),
    getCategoryOptions(),
  ]);
  const rows = found.slice(0, PAGE_SIZE);
  // An older page that has emptied (its last rows were sorted or deleted)
  // would claim there is nothing left: go back to the newest page.
  if (before && rows.length === 0) redirect(transactionsHref({ showAll, filter }));
  const last = rows.at(-1);
  const hasOlder = found.length > PAGE_SIZE;
  const [summary, filterOptions, suggestions] = await Promise.all([
    showAll ? getTransactionSummary(filter) : null,
    showAll ? getFilterOptions() : null,
    getSuggestions(rows.flatMap((row) => (row.toSort && row.payee ? [row.payee] : []))),
  ]);
  const { currency, locale } = getConfig();
  const total = summary ? summary.count : counts.toSort;
  const narrowed = Object.keys(filter).length > 0;

  const heading = "sticky top-0 z-10 h-[38px] border-y border-line bg-surface font-medium";

  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>{t("transactions.page.title")}</HeroTitle>
          <HeroLead>{t("transactions.page.lead")}</HeroLead>
        </div>
        <HeroFigure
          label={
            counts.toSort === 0 && counts.all > 0
              ? t("transactions.page.allSorted")
              : t("transactions.page.toSort")
          }
          amount={[String(counts.toSort), ""]}
          tone={counts.toSort > 0 ? "normal" : counts.all > 0 ? "done" : "quiet"}
        />
      </Hero>

      <section className="flex-1 rounded-2xl border border-line bg-surface px-2.5 pt-2.5 pb-2.5">
        <div className="flex items-center gap-1 px-1 pb-2">
          <Link
            href="/transactions"
            className={tab(!showAll)}
            aria-current={!showAll ? "page" : undefined}
          >
            {t("transactions.page.tabToSort")}{" "}
            <span className="text-muted tabular-nums">{counts.toSort}</span>
          </Link>
          <Link
            href="/transactions?show=all"
            className={tab(showAll)}
            aria-current={showAll ? "page" : undefined}
          >
            {t("transactions.page.tabAll")}{" "}
            <span className="text-muted tabular-nums">{counts.all}</span>
          </Link>
        </div>

        {filterOptions && summary && (
          <>
            <TransactionFilters
              filter={filter}
              accounts={filterOptions.accounts}
              categories={filterOptions.categories}
              // The month in the address is offered too, even when it has no transactions.
              months={[
                ...new Set([...filterOptions.months, ...(filter.month ? [filter.month] : [])]),
              ]
                .sort()
                .reverse()
                .map((month) => ({ month, label: formatMonth(month, locale) }))}
            />
            <p className="px-1 pb-2.5 text-[14.5px] text-muted">
              {richText(
                t,
                narrowed ? "transactions.summary.narrowed" : "transactions.summary.all",
                {
                  count: summary.count,
                  in: formatMoney(summary.moneyIn, currency, locale),
                  out: formatMoney(Math.abs(summary.moneyOut), currency, locale),
                },
                {
                  n: (chunks) => <span className="tabular-nums">{chunks}</span>,
                  b: (chunks) => (
                    <span className="font-medium text-ink tabular-nums">{chunks}</span>
                  ),
                },
              )}
            </p>
          </>
        )}

        {rows.length === 0 ? (
          <div className="px-3.5 py-6 text-muted">
            {counts.all === 0 ? (
              <>
                <p>{t("transactions.page.emptyNone")}</p>
                <Link href="/import" className={`${primaryButton} mt-4 inline-block px-3.5 py-2`}>
                  {t("transactions.page.emptyImport")}
                </Link>
              </>
            ) : showAll ? (
              <p>{t("transactions.page.emptyNoMatch")}</p>
            ) : (
              <p>{t("transactions.page.emptySorted")}</p>
            )}
          </div>
        ) : (
          <CategoryChoicesProvider groups={groups}>
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-[12.5px] text-muted">
                  <th scope="col" className={`${heading} w-32 pl-3.5 text-left`}>
                    {t("transactions.page.headingDate")}
                  </th>
                  <th scope="col" className={`${heading} text-left`}>
                    {t("transactions.page.headingPayee")}
                  </th>
                  <th scope="col" className={`${heading} w-28 text-left`}>
                    {t("transactions.page.headingAccount")}
                  </th>
                  <th scope="col" className={`${heading} w-60 text-left xl:w-80`}>
                    {t("transactions.page.headingCategory")}
                  </th>
                  <th scope="col" className={`${heading} w-28 text-right`}>
                    {t("transactions.page.headingAmount")}
                  </th>
                  <th scope="col" className={`${heading} w-14 pr-2.5`}>
                    <span className="sr-only">{t("transactions.page.headingActions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const date = formatDate(row.date, locale);
                  const payee = row.starting ? t("transactions.page.startingBalance") : row.payee;
                  const describedAs = payee
                    ? t("transactions.page.describedAs", { payee, date })
                    : t("transactions.page.describedAsNoPayee", { date });
                  const amount = formatAmount(row.amount, currency, locale);
                  return (
                    <tr key={row.id} className="data-row group/row">
                      <td className="h-[50px] pl-3.5 whitespace-nowrap text-muted tabular-nums">
                        {date}
                      </td>
                      <td className="max-w-0 pr-4">
                        <p className="truncate text-[15.5px] font-medium">
                          {payee ?? t("transactions.page.noName")}
                        </p>
                        {row.note && <p className="truncate text-[13px] text-muted">{row.note}</p>}
                      </td>
                      <td className="truncate text-muted">{row.account}</td>
                      <td>
                        {row.starting ? (
                          <span className="text-muted">
                            {t("transactions.page.startingBalance")}
                          </span>
                        ) : (
                          <CategorySelect
                            transactionId={row.id}
                            describedAs={describedAs}
                            amount={amount}
                            categoryId={row.categoryId}
                            categoryName={row.category}
                            categoryArchived={row.categoryArchived}
                            toSort={row.toSort}
                            suggestion={row.payee ? suggestions.get(row.payee) : undefined}
                          />
                        )}
                      </td>
                      <td className="text-right font-semibold whitespace-nowrap tabular-nums">
                        {row.amount > 0 ? "+" : ""}
                        {amount}
                      </td>
                      <td className="pr-2.5">
                        {!row.starting && (
                          <DeleteTransaction
                            transactionId={row.id}
                            describedAs={describedAs}
                            question={
                              payee
                                ? t("transactions.page.deleteQuestion", {
                                    payee,
                                    amount: formatMoney(row.amount, currency, locale),
                                    date,
                                  })
                                : t("transactions.page.deleteQuestionNoPayee", {
                                    amount: formatMoney(row.amount, currency, locale),
                                    date,
                                  })
                            }
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CategoryChoicesProvider>
        )}

        {(hasOlder || before) && (
          <p className="px-3.5 pt-4 text-muted">
            {t("transactions.page.showing", { shown: rows.length, total })}{" "}
            {before && (
              <Link
                href={transactionsHref({ showAll, filter })}
                className="font-medium text-brand underline"
              >
                {t("transactions.page.newest")}
              </Link>
            )}
            {before && hasOlder && " "}
            {last && hasOlder && (
              <Link
                href={transactionsHref({
                  showAll,
                  filter,
                  before: { date: last.date, id: last.id },
                })}
                className="font-medium text-brand underline"
              >
                {t("transactions.page.older")}
              </Link>
            )}
          </p>
        )}
      </section>
    </>
  );
}
