import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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
import { getConfig } from "@/lib/config";
import { formatDate } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import { readAddress, transactionsHref } from "@/lib/transactions-address";

export const metadata: Metadata = { title: "Transactions" };

const PAGE_SIZE = 200;

const LEAD = "Everything imported from your bank. Sort each one into a category.";

const tab = (active: boolean) =>
  `rounded-[9px] px-3 py-1.5 text-[14.5px] font-medium transition-colors ${
    active ? "bg-ok-track text-ink" : "text-muted hover:bg-hover hover:text-ink"
  }`;

export default function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  return (
    <Suspense fallback={<Loading />}>
      <Transactions searchParams={searchParams} />
    </Suspense>
  );
}

/** What shows while the list loads: the page as it will be, with the rows still empty. */
function Loading() {
  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>Transactions</HeroTitle>
          <HeroLead>{LEAD}</HeroLead>
        </div>
      </Hero>
      <section
        className="flex-1 rounded-2xl border border-line bg-surface px-2.5 pt-2.5 pb-2.5"
        aria-hidden="true"
      >
        <div className="flex items-center gap-1 px-1 pb-2">
          <span className={tab(true)}>To sort</span>
          <span className={tab(false)}>All</span>
        </div>
        <div className="flex animate-pulse flex-col gap-2 px-1 pt-1">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-[42px] rounded-[9px] bg-hover" />
          ))}
        </div>
      </section>
    </>
  );
}

async function Transactions({ searchParams }: Pick<PageProps<"/transactions">, "searchParams">) {
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
          <HeroTitle>Transactions</HeroTitle>
          <HeroLead>{LEAD}</HeroLead>
        </div>
        <HeroFigure
          label={counts.toSort === 0 && counts.all > 0 ? "Everything is sorted" : "To sort"}
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
            To sort <span className="text-muted tabular-nums">{counts.toSort}</span>
          </Link>
          <Link
            href="/transactions?show=all"
            className={tab(showAll)}
            aria-current={showAll ? "page" : undefined}
          >
            All <span className="text-muted tabular-nums">{counts.all}</span>
          </Link>
        </div>

        {filterOptions && summary && (
          <>
            <TransactionFilters
              filter={filter}
              accounts={filterOptions.accounts}
              categories={filterOptions.categories}
            />
            <p className="px-1 pb-2.5 text-[14.5px] text-muted">
              <span className="tabular-nums">{summary.count}</span>{" "}
              {summary.count === 1 ? "transaction" : "transactions"}
              {narrowed && (summary.count === 1 ? " matches" : " match")}. Money in{" "}
              <span className="font-medium text-ink tabular-nums">
                +{formatMoney(summary.moneyIn, currency, locale)}
              </span>
              , money out{" "}
              <span className="font-medium text-ink tabular-nums">
                {formatMoney(summary.moneyOut, currency, locale)}
              </span>
              .
            </p>
          </>
        )}

        {rows.length === 0 ? (
          <div className="px-3.5 py-6 text-muted">
            {counts.all === 0 ? (
              <>
                <p>No transactions yet. They come in through a file you download from your bank.</p>
                <Link href="/import" className={`${primaryButton} mt-4 inline-block px-3.5 py-2`}>
                  Import from bank
                </Link>
              </>
            ) : showAll ? (
              <p>No transactions match.</p>
            ) : (
              <p>Everything is sorted. New transactions appear here after your next import.</p>
            )}
          </div>
        ) : (
          <CategoryChoicesProvider groups={groups}>
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-[12.5px] text-muted">
                  <th scope="col" className={`${heading} w-32 pl-3.5 text-left`}>
                    Date
                  </th>
                  <th scope="col" className={`${heading} text-left`}>
                    Payee
                  </th>
                  <th scope="col" className={`${heading} w-40 text-left`}>
                    Account
                  </th>
                  <th scope="col" className={`${heading} w-80 text-left`}>
                    Category
                  </th>
                  <th scope="col" className={`${heading} w-32 text-right`}>
                    Amount
                  </th>
                  <th scope="col" className={`${heading} w-14 pr-2.5`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const date = formatDate(row.date, locale);
                  const describedAs = `${row.payee ?? "transaction"} on ${date}`;
                  const amount = formatAmount(row.amount, currency, locale);
                  return (
                    <tr key={row.id} className="data-row group/row">
                      <td className="h-[50px] pl-3.5 whitespace-nowrap text-muted tabular-nums">
                        {date}
                      </td>
                      <td className="max-w-0 pr-4">
                        <p className="truncate text-[15.5px] font-medium">
                          {row.payee ?? "No name"}
                        </p>
                        {row.note && <p className="truncate text-[13px] text-muted">{row.note}</p>}
                      </td>
                      <td className="truncate text-muted">{row.account}</td>
                      <td>
                        {row.starting ? (
                          <span className="text-muted">Starting balance</span>
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
                            question={`Delete ${row.payee ?? "this transaction"} of ${formatMoney(row.amount, currency, locale)} on ${date}? A later import of the same bank file will not bring it back.`}
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
            Showing {rows.length} of {total}.{" "}
            {before && (
              <Link
                href={transactionsHref({ showAll, filter })}
                className="font-medium text-brand underline"
              >
                Newest
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
                Older
              </Link>
            )}
          </p>
        )}
      </section>
    </>
  );
}
