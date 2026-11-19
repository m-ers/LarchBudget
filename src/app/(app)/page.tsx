import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AssignedInput } from "@/components/budget/assigned-input";
import { CategoryName } from "@/components/budget/category-name";
import { Gauge } from "@/components/budget/gauge";
import { GroupBody } from "@/components/budget/group-body";
import { getBudgetMonth } from "@/app/queries";
import { NewGroup } from "@/components/budget/new-group";
import { primaryButton } from "@/components/form";
import { Hero, HeroFigure, HeroLead, HeroTitle, PageSkeleton } from "@/components/hero";
import { ChevronLeftIcon, ChevronRightIcon, EnvelopeToken } from "@/components/icons";
import type { CategoryRow } from "@/db/budget";
import { getConfig } from "@/lib/config";
import {
  addMonths,
  currentMonth,
  daysLeftInMonth,
  isMonth,
  monthLabelParts,
  type Month,
} from "@/lib/dates";
import { groupColor } from "@/lib/group-colors";
import { formatAmount, formatMoney, formatMoneyParts, formatMoneyRounded } from "@/lib/money";

export default function BudgetPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Budget searchParams={searchParams} />
    </Suspense>
  );
}

const monthHref = (month: Month, thisMonth: Month) =>
  month === thisMonth ? "/" : `/?month=${month}`;

const monthButton =
  "flex size-7 items-center justify-center rounded-[7px] border border-white/25 transition-colors hover:bg-white/10";

async function Budget({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  // "This month" depends on the clock, so wait for a real request first.
  await connection();
  const thisMonth = currentMonth();
  const month = isMonth(params.month) ? params.month : thisMonth;

  const budget = await getBudgetMonth(month);
  const { currency, locale } = getConfig();
  const { spent, assigned } = budget.totals;
  const daysLeft = daysLeftInMonth(month);
  const ready = budget.readyToAssign;

  // What the headline says about the money that is not in a category yet.
  const headline =
    ready < 0
      ? ({ label: "Assigned more than you have", tone: "alert" } as const)
      : ready > 0
        ? ({ label: "Ready to assign", tone: "normal" } as const)
        : budget.hasAccounts
          ? ({ label: "Every cent is assigned", tone: "done" } as const)
          : ({ label: "Ready to assign", tone: "quiet" } as const);

  return (
    <>
      <Hero>
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <Link
              href={monthHref(addMonths(month, -1), thisMonth)}
              aria-label="Previous month"
              className={monthButton}
            >
              <ChevronLeftIcon width={15} height={15} />
            </Link>
            <HeroTitle>
              {monthLabelParts(month, locale).map((part, i) =>
                part.type === "year" ? (
                  <span key={i} className="font-normal opacity-65">
                    {part.value}
                  </span>
                ) : (
                  part.value
                ),
              )}
            </HeroTitle>
            <Link
              href={monthHref(addMonths(month, 1), thisMonth)}
              aria-label="Next month"
              className={monthButton}
            >
              <ChevronRightIcon width={15} height={15} />
            </Link>
            {month !== thisMonth && (
              <Link
                href="/"
                className="ml-1.5 rounded-[7px] border border-white/25 px-2.5 py-1 text-sm transition-colors hover:bg-white/10"
              >
                This month
              </Link>
            )}
          </div>
          {(spent > 0 || assigned !== 0) && (
            <HeroLead>
              <b className="font-semibold text-white">
                {formatMoneyRounded(spent, currency, locale)}
              </b>{" "}
              spent of {formatMoneyRounded(assigned, currency, locale)} assigned
              {daysLeft !== null && (
                <>
                  {" · "}
                  <b className="font-semibold text-white">
                    {daysLeft} {daysLeft === 1 ? "day" : "days"}
                  </b>{" "}
                  to go
                </>
              )}
            </HeroLead>
          )}
        </div>
        <HeroFigure amount={formatMoneyParts(ready, currency, locale)} {...headline} />
      </Hero>

      <section className="flex-1 rounded-2xl border border-line bg-surface px-2.5 pt-1.5 pb-2.5">
        {!budget.hasAccounts && (
          <div className="mx-3.5 mt-3 mb-2 flex items-center justify-between gap-6 rounded-xl bg-ok-track px-5 py-4">
            <p className="max-w-xl">
              <span className="font-semibold">Welcome to LarchBudget.</span> Start by adding the
              accounts your money is in. Their balance becomes your money to assign, and then you
              divide it over categories.
            </p>
            <Link href="/accounts" className={`${primaryButton} shrink-0 px-3.5 py-2`}>
              Add an account
            </Link>
          </div>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th scope="col" className="h-[38px] w-[54px]">
                <span className="sr-only">Group colour</span>
              </th>
              <th scope="col" className="text-left font-medium">
                Category
              </th>
              <th scope="col" className="w-32 text-right font-medium">
                Assigned
              </th>
              <th scope="col" className="w-32 text-right font-medium">
                Spent
              </th>
              <th scope="col" className="w-40 pr-6 text-right font-medium">
                Available
              </th>
            </tr>
          </thead>
          {budget.groups.map((group) => (
            <GroupBody
              key={group.id ?? "ungrouped"}
              id={group.id}
              name={group.name}
              total={formatMoney(group.available, currency, locale)}
              categoryCount={group.categories.length}
            >
              {group.categories.map((category) => (
                <CategoryTableRow
                  key={category.id}
                  category={category}
                  color={groupColor(group.colorSlot)}
                  month={month}
                  currency={currency}
                  locale={locale}
                />
              ))}
            </GroupBody>
          ))}
        </table>

        {budget.groups.length === 0 && (
          <p className="max-w-2xl px-3.5 pt-5 pb-2 text-muted">
            No categories yet. A category is a purpose you set money aside for, such as Rent,
            Groceries or Holiday. Categories live in groups, so start by naming your first group,
            for example Fixed costs.
          </p>
        )}

        <div className="mt-3">
          <NewGroup
            placeholder={budget.groups.length === 0 ? "Name your first group" : "New group"}
          />
        </div>
      </section>
    </>
  );
}

function CategoryTableRow({
  category,
  color,
  month,
  currency,
  locale,
}: {
  category: CategoryRow;
  color: string;
  month: Month;
  currency: string;
  locale: string;
}) {
  const { id, name, assigned, activity, available } = category;
  const availableLabel = formatMoney(available, currency, locale);

  // Spending is shown as a positive amount; a net refund gets a plus sign.
  const spentLabel =
    activity === 0
      ? "–"
      : activity < 0
        ? formatAmount(-activity, currency, locale)
        : `+${formatAmount(activity, currency, locale)}`;

  return (
    <tr className="data-row group/row">
      <td className="h-[43px] w-[54px] pl-3.5">
        <EnvelopeToken color={color} />
      </td>
      <td>
        <CategoryName id={id} name={name} available={availableLabel} hasBalance={available !== 0} />
      </td>
      <td>
        <AssignedInput
          key={`${id}:${month}:${assigned}`}
          categoryId={id}
          categoryName={name}
          month={month}
          value={assigned}
          currency={currency}
          locale={locale}
        />
      </td>
      <td className="text-right text-muted tabular-nums">{spentLabel}</td>
      <td className="pr-3.5">
        <Gauge available={available} activity={activity} label={availableLabel} />
      </td>
    </tr>
  );
}
