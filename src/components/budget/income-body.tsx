"use client";

import Link from "next/link";
import { useState } from "react";
import { createIncomeCategoryAction } from "@/app/actions";
import type { BudgetMonth, IncomeCategoryRow } from "@/db/budget";
import { groupColor } from "@/lib/group-colors";
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
        totals={["", "", isEmpty ? "" : `${formatMoney(received, currency, locale)} received`]}
      >
        <span className="font-semibold">Income</span>
        <RowAction
          label="Add an income category"
          title="Add income category"
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
          label="New income category"
          placeholder={isEmpty ? "New income category, e.g. Salary" : "New income category"}
          autoFocus={!isEmpty}
          wide
          onFocus={() => setAdding(true)}
          onLeave={() => setAdding(false)}
        />
      )}
    </tbody>
  );
}

/** One income category: its name and actions, and in the last column what came in this month. */
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
  const { id, received } = category;
  const amount = formatMoney(received, currency, locale);
  const menu = useMenu();

  return (
    <tr className="data-row group/row" onContextMenu={menu.openAtPointer}>
      <td className="h-[43px] w-[54px] pl-3.5">
        <EnvelopeToken color={groupColor(null)} />
      </td>
      <td>
        <CategoryName category={category} place={{ groupId: null, first, last }} menu={menu} />
      </td>
      <td />
      <td />
      <td className="pr-6 text-right font-medium whitespace-nowrap tabular-nums">
        {received === 0 ? (
          <span className="text-muted">{amount}</span>
        ) : (
          // The month's transactions behind the amount.
          <Link
            href={transactionsHref({ showAll: true, filter: { category: id, month } })}
            title="See these transactions"
            className="rounded-sm underline-offset-2 hover:underline"
          >
            {amount}
          </Link>
        )}
      </td>
    </tr>
  );
}
