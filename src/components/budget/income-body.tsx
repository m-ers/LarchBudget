"use client";

import Link from "next/link";
import { useState } from "react";
import { createIncomeCategoryAction } from "@/app/actions";
import type { BudgetMonth, IncomeCategoryRow } from "@/db/budget";
import { useT } from "@/i18n/client";
import { formatDayMonth } from "@/lib/dates";
import { groupColor } from "@/lib/group-colors";
import { receivedPeriod } from "@/lib/income";
import { formatMoney } from "@/lib/money";
import { transactionsHref } from "@/lib/transactions-address";
import { EnvelopeToken, PlusIcon } from "../icons";
import { useMenu } from "../menu";
import { useAddByName } from "./add-by-name";
import { useBudget } from "./budget-context";
import { CategoryName } from "./category-name";
import { NewCategoryRow, SectionHeading } from "./group-body";
import { RowAction } from "./row-action";

/**
 * The income section above the groups: the income categories, each with
 * what came in through it this month, and the inline "new income category"
 * field. Income categories hold no money, so their rows have nothing
 * assigned or spent and no gauge.
 */
export function IncomeBody({ income }: { income: BudgetMonth["income"] }) {
  const { currency, locale } = useBudget();
  const t = useT();
  const { categories, received } = income;
  const isEmpty = categories.length === 0;
  // True while the "new income category" field is in use.
  const [adding, setAdding] = useState(false);
  const adder = useAddByName(createIncomeCategoryAction);
  // An empty section always shows its field: there is nothing else in it.
  const showField = isEmpty || adding || adder.pending || adder.error;

  return (
    <tbody>
      <SectionHeading
        totals={[
          "",
          "",
          isEmpty
            ? ""
            : t("budget.income.received", { amount: formatMoney(received, currency, locale) }),
        ]}
      >
        <span className="font-semibold">{t("budget.income.title")}</span>
        <RowAction
          label={t("budget.income.addLabel")}
          title={t("budget.income.addTitle")}
          onClick={() => setAdding(true)}
        >
          <PlusIcon width={15} height={15} />
        </RowAction>
      </SectionHeading>

      {categories.map((category, i) => (
        <IncomeRow
          key={category.id}
          category={category}
          first={i === 0}
          last={i === categories.length - 1}
        />
      ))}

      {showField && (
        <NewCategoryRow
          state={adder}
          label={t("budget.income.newLabel")}
          placeholder={
            isEmpty ? t("budget.income.newPlaceholderFirst") : t("budget.income.newPlaceholder")
          }
          autoFocus={!isEmpty}
          wide
          onFocus={() => setAdding(true)}
          onLeave={() => setAdding(false)}
        />
      )}
    </tbody>
  );
}

/**
 * One income category: its name and actions, and in the last column what
 * came in for this month. For a category that counts for the next month,
 * pointing at the amount says which days that covers.
 */
function IncomeRow({
  category,
  first,
  last,
}: {
  category: IncomeCategoryRow;
  first: boolean;
  last: boolean;
}) {
  const { month, currency, locale } = useBudget();
  const t = useT();
  const { id, received, nextMonth } = category;
  const amount = formatMoney(received, currency, locale);
  const menu = useMenu();
  const period = receivedPeriod(month, true);
  const days = nextMonth
    ? t("budget.income.receivedPeriod", {
        from: formatDayMonth(period.first, locale),
        to: formatDayMonth(period.last, locale),
      })
    : undefined;

  return (
    <tr className="data-row group/row" onContextMenu={menu.openAtPointer}>
      <td className="h-[43px] w-[54px] pl-3.5">
        <EnvelopeToken color={groupColor(null)} />
      </td>
      <td>
        <CategoryName
          category={category}
          place={{ groupId: null, first, last }}
          menu={menu}
          nextMonth={nextMonth}
        />
      </td>
      <td />
      <td />
      <td className="pr-6 text-right font-medium whitespace-nowrap tabular-nums">
        {received === 0 ? (
          <span className="text-muted" title={days}>
            {amount}
          </span>
        ) : (
          // The transactions behind the amount. Days from two months cannot
          // be one month's list, so then it is all of the category's.
          <Link
            href={transactionsHref({
              showAll: true,
              filter: nextMonth ? { category: id } : { category: id, month },
            })}
            title={days ?? t("budget.row.seeTransactions")}
            className="rounded-sm underline-offset-2 hover:underline"
          >
            {amount}
          </Link>
        )}
      </td>
    </tr>
  );
}
