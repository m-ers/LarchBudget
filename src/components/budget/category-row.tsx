"use client";

import type { CategoryRow as Category } from "@/db/budget";
import { explainAvailable } from "@/lib/gauge";
import { formatAmount, formatMoney } from "@/lib/money";
import { EnvelopeToken } from "../icons";
import { AssignedInput } from "./assigned-input";
import { useBudget } from "./budget-context";
import { CategoryName } from "./category-name";
import { Gauge } from "./gauge";

/** One category in the budget table: its name and actions, Assigned, Spent and Available. */
export function CategoryRow({ category, color }: { category: Category; color: string }) {
  const { currency, locale } = useBudget();
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
        <CategoryName id={id} name={name} balance={category.balance} />
      </td>
      <td>
        <AssignedInput categoryId={id} categoryName={name} value={assigned} />
      </td>
      <td className="text-right text-muted tabular-nums">{spentLabel}</td>
      <td className="pr-3.5">
        <Gauge
          available={available}
          activity={activity}
          label={availableLabel}
          explanation={explainAvailable(category, currency, locale)}
        />
      </td>
    </tr>
  );
}
