"use client";

import { useState } from "react";
import type { CategoryRow as Category } from "@/db/budget";
import { explainAvailable } from "@/lib/gauge";
import { formatAmount, formatMoney } from "@/lib/money";
import { EnvelopeToken } from "../icons";
import { useMenu } from "../menu";
import { AssignedInput } from "./assigned-input";
import { useBudget } from "./budget-context";
import { CategoryName, type Place } from "./category-name";
import { Gauge } from "./gauge";
import { MoveMoney, type Flow } from "./move-money";

/** The Spent column: spending as a positive amount, a net refund with a plus sign. */
export function formatSpent(activity: number, currency: string, locale: string): string {
  if (activity === 0) return "–";
  return activity < 0
    ? formatAmount(-activity, currency, locale)
    : `+${formatAmount(activity, currency, locale)}`;
}

/**
 * One category in the budget table: its name and actions, Assigned, Spent
 * and Available, and under it the form for moving money while that is open.
 */
export function CategoryRow({
  category,
  color,
  place,
}: {
  category: Category;
  color: string;
  place: Place;
}) {
  const { currency, locale } = useBudget();
  const { id, name, assigned, activity, available } = category;
  const availableLabel = formatMoney(available, currency, locale);
  const menu = useMenu();
  // Which way money is being moved, while that form is open.
  const [moving, setMoving] = useState<Flow | null>(null);

  return (
    <>
      <tr className="data-row group/row" onContextMenu={menu.openAtPointer}>
        <td className="h-[43px] w-[54px] pl-3.5">
          <EnvelopeToken color={color} />
        </td>
        <td>
          <CategoryName category={category} place={place} menu={menu} onMoveMoney={setMoving} />
        </td>
        <td>
          <AssignedInput categoryId={id} categoryName={name} value={assigned} />
        </td>
        <td className="text-right text-muted tabular-nums">
          {formatSpent(activity, currency, locale)}
        </td>
        <td className="pr-3.5">
          <Gauge
            available={available}
            activity={activity}
            label={availableLabel}
            explanation={explainAvailable(category, currency, locale)}
          />
        </td>
      </tr>
      {moving && (
        <MoveMoney
          key={moving}
          category={category}
          flow={moving}
          onClose={(byKeyboard) => {
            setMoving(null);
            if (byKeyboard) menu.button.current?.focus();
          }}
        />
      )}
    </>
  );
}
