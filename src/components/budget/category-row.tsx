"use client";

import Link from "next/link";
import { useState } from "react";
import type { CategoryRow as Category } from "@/db/budget";
import { useT } from "@/i18n/client";
import type { Translate } from "@/i18n/translate";
import { explainAvailable } from "@/lib/gauge";
import { formatAmount, formatMoney } from "@/lib/money";
import { transactionsHref } from "@/lib/transactions-address";
import { useMenu } from "../menu";
import { useSave } from "../use-save";
import { AssignedInput } from "./assigned-input";
import { useBudget } from "./budget-context";
import { CategoryName, type Place } from "./category-name";
import { Gauge } from "./gauge";
import { IconPicker } from "./icon-picker";
import { MoveMoney, type Flow } from "./move-money";

/** The Spent column: spending as a positive amount, a net refund with a plus sign. */
export function formatSpent(activity: number, currency: string, locale: string): string {
  if (activity === 0) return "–";
  return activity < 0
    ? formatAmount(-activity, currency, locale)
    : `+${formatAmount(activity, currency, locale)}`;
}

/** The sentence for the gauge's tooltip, from the parts `explainAvailable` found. */
function availableSentence(
  t: Translate,
  category: Pick<Category, "assigned" | "activity" | "available">,
  currency: string,
  locale: string,
): string {
  const money = (minorUnits: number) => formatMoney(minorUnits, currency, locale);
  const { overspentBy, parts } = explainAvailable(category);
  const sum =
    parts.length === 0
      ? t("budget.gauge.explain.nothing")
      : parts
          .map(({ kind, amount }, i) =>
            t(`budget.gauge.explain.${kind}`, {
              amount:
                i === 0 ? money(amount) : `${amount < 0 ? "−" : "+"} ${money(Math.abs(amount))}`,
            }),
          )
          .join(" ");
  return overspentBy === null
    ? sum
    : t("budget.gauge.explain.overspent", { amount: money(overspentBy), sum });
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
  const { month, currency, locale } = useBudget();
  const { id, name, assigned, activity, available } = category;
  const availableLabel = formatMoney(available, currency, locale);
  const t = useT();
  const menu = useMenu();
  // Choosing the icon; a failure is reported beside the name.
  const iconSave = useSave();
  // Which way money is being moved, while that form is open.
  const [moving, setMoving] = useState<Flow | null>(null);

  return (
    <>
      <tr className="data-row group/row" onContextMenu={menu.openAtPointer}>
        <td className="h-[43px] w-[54px] pl-3.5">
          <IconPicker category={category} color={color} save={iconSave.save} />
        </td>
        <td>
          <CategoryName
            category={category}
            place={place}
            menu={menu}
            money={{ balance: category.balance, available, onMoveMoney: setMoving }}
            iconError={iconSave.error}
          />
        </td>
        <td>
          <AssignedInput categoryId={id} categoryName={name} value={assigned} />
        </td>
        <td className="text-right text-muted tabular-nums">
          {activity === 0 ? (
            formatSpent(activity, currency, locale)
          ) : (
            // The month's transactions behind the amount.
            <Link
              href={transactionsHref({ showAll: true, filter: { category: id, month } })}
              title={t("budget.row.seeTransactions")}
              className="rounded-sm underline-offset-2 hover:text-ink hover:underline"
            >
              {formatSpent(activity, currency, locale)}
            </Link>
          )}
        </td>
        <td className="pr-3.5">
          <Gauge
            available={available}
            activity={activity}
            label={availableLabel}
            explanation={availableSentence(t, category, currency, locale)}
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
