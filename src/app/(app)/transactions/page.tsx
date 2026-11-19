import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCategoryOptions, getTransactionCounts, getTransactions } from "@/app/queries";
import { primaryButton } from "@/components/form";
import { Hero, HeroFigure, HeroLead, HeroTitle, PageSkeleton } from "@/components/hero";
import { CategorySelect } from "@/components/transactions/category-select";
import { getConfig } from "@/lib/config";
import { formatDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";

export const metadata: Metadata = { title: "Transactions" };

const PAGE_SIZE = 200;

export default function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Transactions searchParams={searchParams} />
    </Suspense>
  );
}

async function Transactions({ searchParams }: Pick<PageProps<"/transactions">, "searchParams">) {
  const params = await searchParams;
  const showAll = params.show === "all";
  // Whole numbers only: the database refuses a limit like 200.5.
  const limit = Math.min(5000, Math.max(PAGE_SIZE, Math.floor(Number(params.limit)) || PAGE_SIZE));

  const [counts, rows, groups] = await Promise.all([
    getTransactionCounts(),
    getTransactions({ only: showAll ? undefined : "to-sort", limit }),
    getCategoryOptions(),
  ]);
  const { currency, locale } = getConfig();
  const total = showAll ? counts.all : counts.toSort;

  const tab = (active: boolean) =>
    `rounded-[9px] px-3 py-1.5 text-[14.5px] font-medium transition-colors ${
      active ? "bg-ok-track text-ink" : "text-muted hover:bg-hover hover:text-ink"
    }`;

  return (
    <>
      <Hero>
        <div className="relative">
          <HeroTitle>Transactions</HeroTitle>
          <HeroLead>Everything imported from your bank. Sort each one into a category.</HeroLead>
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

        {rows.length === 0 ? (
          <div className="px-3.5 py-6 text-muted">
            {counts.all === 0 ? (
              <>
                <p>No transactions yet. They come in through a file you download from your bank.</p>
                <Link href="/import" className={`${primaryButton} mt-4 inline-block px-3.5 py-2`}>
                  Import from bank
                </Link>
              </>
            ) : (
              <p>Everything is sorted. New transactions appear here after your next import.</p>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-line text-[12.5px] text-muted">
                <th scope="col" className="h-[38px] w-32 pl-3.5 text-left font-medium">
                  Date
                </th>
                <th scope="col" className="text-left font-medium">
                  Payee
                </th>
                <th scope="col" className="w-40 text-left font-medium">
                  Account
                </th>
                <th scope="col" className="w-60 text-left font-medium">
                  Category
                </th>
                <th scope="col" className="w-32 pr-3.5 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="data-row">
                  <td className="h-[50px] pl-3.5 whitespace-nowrap text-muted tabular-nums">
                    {formatDate(row.date, locale)}
                  </td>
                  <td className="max-w-0 pr-4">
                    <p className="truncate text-[15.5px] font-medium">{row.payee ?? "No name"}</p>
                    {row.note && <p className="truncate text-[13px] text-muted">{row.note}</p>}
                  </td>
                  <td className="truncate text-muted">{row.account}</td>
                  <td>
                    <CategorySelect
                      transactionId={row.id}
                      describedAs={`${row.payee ?? "transaction"} on ${formatDate(row.date, locale)}`}
                      categoryId={row.categoryId}
                      categoryName={row.category}
                      categoryArchived={row.categoryArchived}
                      toSort={row.toSort}
                      groups={groups}
                    />
                  </td>
                  <td className="pr-3.5 text-right font-semibold whitespace-nowrap tabular-nums">
                    {row.amount > 0 ? "+" : ""}
                    {formatAmount(row.amount, currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > rows.length && (
          <p className="px-3.5 pt-4 text-muted">
            Showing the latest {rows.length} of {total}.{" "}
            <Link
              href={`/transactions?${showAll ? "show=all&" : ""}limit=${limit + PAGE_SIZE * 2}`}
              className="font-medium text-brand underline"
            >
              Show more
            </Link>
          </p>
        )}
      </section>
    </>
  );
}
