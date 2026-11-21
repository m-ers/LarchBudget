import Link from "next/link";
import { connection } from "next/server";
import { getArchivedCategories, getBudgetMonth } from "@/app/queries";
import { BudgetView } from "@/components/budget/budget-view";
import { HeroTitle } from "@/components/hero";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { getDateLocale, getT } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import {
  addMonths,
  currentMonth,
  daysLeftInMonth,
  isMonth,
  monthLabelParts,
  type Month,
} from "@/lib/dates";

const monthHref = (month: Month, thisMonth: Month) =>
  month === thisMonth ? "/" : `/?month=${month}`;

const monthButton =
  "flex size-7 items-center justify-center rounded-[7px] border border-white/25 transition-colors hover:bg-white/10";

// Opening this page waits for the server on purpose: see `layout.tsx`.
export const instant = false;

export default async function BudgetPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  // "This month" depends on the clock, so wait for a real request first.
  await connection();
  const thisMonth = currentMonth();
  const month = isMonth(params.month) ? params.month : thisMonth;

  const [budget, archived] = await Promise.all([getBudgetMonth(month), getArchivedCategories()]);
  const { currency, locale } = getConfig();

  return (
    // Keyed by month: changes still being saved belong to the month they were made in.
    <BudgetView
      key={month}
      budget={budget}
      archived={archived}
      month={month}
      currency={currency}
      locale={locale}
      daysLeft={daysLeftInMonth(month)}
      monthNav={<MonthNav month={month} thisMonth={thisMonth} />}
    />
  );
}

/** The month's title, with links to the months around it. */
async function MonthNav({ month, thisMonth }: { month: Month; thisMonth: Month }) {
  const t = await getT();
  const locale = await getDateLocale();
  return (
    <div className="flex items-center gap-2.5">
      <Link
        href={monthHref(addMonths(month, -1), thisMonth)}
        aria-label={t("budget.header.previousMonth")}
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
        aria-label={t("budget.header.nextMonth")}
        className={monthButton}
      >
        <ChevronRightIcon width={15} height={15} />
      </Link>
      {month !== thisMonth && (
        <Link
          href="/"
          className="ml-1.5 rounded-[7px] border border-white/25 px-2.5 py-1 text-sm transition-colors hover:bg-white/10"
        >
          {t("budget.header.thisMonth")}
        </Link>
      )}
    </div>
  );
}
