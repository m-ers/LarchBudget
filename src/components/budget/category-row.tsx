"use client";

import Link from "next/link";
import { useState } from "react";
import type { CategoryRow as Category } from "@/db/budget";
import { useDateLocale, useT } from "@/i18n/client";
import type { Translate } from "@/i18n/translate";
import { formatMonth, type Month } from "@/lib/dates";
import { explainAvailable, type TargetPart } from "@/lib/gauge";
import { formatAmount, formatMoney, formatMoneyTrimmed } from "@/lib/money";
import { transactionsHref } from "@/lib/transactions-address";
import { useMenu } from "../menu";
import { useSave } from "../use-save";
import { AssignedInput, type TargetMark } from "./assigned-input";
import { useBudget } from "./budget-context";
import { CategoryName, type Place } from "./category-name";
import { Gauge } from "./gauge";
import { IconPicker } from "./icon-picker";
import { MoveMoney, type Flow } from "./move-money";
import { TargetForm } from "./target-form";

/** The Spent column: spending as a positive amount, a net refund with a plus sign. */
export function formatSpent(activity: number, currency: string, locale: string): string {
  if (activity === 0) return "–";
  return activity < 0
    ? formatAmount(-activity, currency, locale)
    : `+${formatAmount(activity, currency, locale)}`;
}

/** What names a category's target, such as "Target: top up to €400". */
function targetName(
  t: Translate,
  target: TargetPart,
  currency: string,
  locale: string,
  dates: string,
): string {
  const amount = formatMoneyTrimmed(target.amount, currency, locale);
  if (target.kind !== "byMonth") return t(`budget.target.explain.${target.kind}`, { amount });
  const month = formatMonth(target.month, dates);
  return target.passed
    ? t("budget.target.explain.byMonthPassed", { amount, month })
    : t("budget.target.explain.byMonth", { amount, month });
}

/**
 * The ◎ in the Assigned field: what the target still needs, or that it is
 * reached; in a month that is over, or after a "by a month" target's month,
 * only what the target is.
 */
function targetMark(
  t: Translate,
  category: Pick<Category, "name" | "assigned" | "activity" | "available" | "target" | "needed">,
  month: Month,
  thisMonth: Month,
  currency: string,
  locale: string,
  dates: string,
): TargetMark | undefined {
  const { target } = explainAvailable(category, month);
  if (!target) return undefined;
  const name = targetName(t, target, currency, locale, dates);
  const { needed } = category;
  if (needed > 0) {
    const amount = formatMoneyTrimmed(needed, currency, locale);
    const status = t("budget.target.toGo", { target: name, amount });
    return {
      asks: true,
      needed,
      status,
      tip: `${status} ${t("budget.target.clickToAssign")}`,
      label: t("budget.target.assignLabel", { name: category.name, amount }),
      done: t("budget.target.assigned", { name: category.name, amount }),
    };
  }
  const over = month < thisMonth || (target.kind === "byMonth" && target.passed);
  return {
    asks: false,
    status: over
      ? t("budget.target.named", { target: name })
      : t("budget.target.reached", { target: name }),
  };
}

/**
 * The sentence for the gauge's tooltip, from the parts `explainAvailable`
 * found, and the category's target after it.
 */
function availableSentence(
  t: Translate,
  category: Pick<Category, "assigned" | "activity" | "available" | "target">,
  month: Month,
  currency: string,
  locale: string,
  dates: string,
): string {
  const money = (minorUnits: number) => formatMoney(minorUnits, currency, locale);
  const { overspentBy, parts, target } = explainAvailable(category, month);
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
  const explained =
    overspentBy === null
      ? sum
      : t("budget.gauge.explain.overspent", { amount: money(overspentBy), sum });
  // The target on a line of its own.
  return target
    ? `${explained}\n${t("budget.target.named", { target: targetName(t, target, currency, locale, dates) })}`
    : explained;
}

/**
 * One category in the budget table: its name and actions, Assigned (with
 * its target's ◎), Spent and Available, and under it the form for moving
 * money or for its target while one is open.
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
  const { month, currency, locale, figures } = useBudget();
  const { id, name, assigned, activity, available } = category;
  const availableLabel = formatMoney(available, currency, locale);
  const t = useT();
  const dates = useDateLocale();
  const menu = useMenu();
  // Choosing the icon; a failure is reported beside the name.
  const iconSave = useSave();
  // The form open under the row: which way money is being moved, or the target.
  const [open, setOpen] = useState<Flow | "target" | null>(null);

  function close(byKeyboard: boolean) {
    setOpen(null);
    if (byKeyboard) menu.button.current?.focus();
  }

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
            money={{
              balance: category.balance,
              available,
              hasTarget: category.target !== null,
              onMoveMoney: setOpen,
              onTarget: () => setOpen("target"),
            }}
            iconError={iconSave.error}
          />
        </td>
        <td>
          <AssignedInput
            categoryId={id}
            categoryName={name}
            value={assigned}
            target={targetMark(t, category, month, figures.thisMonth, currency, locale, dates)}
          />
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
            explanation={availableSentence(t, category, month, currency, locale, dates)}
          />
        </td>
      </tr>
      {open === "target" && <TargetForm category={category} onClose={close} />}
      {(open === "out" || open === "in") && (
        <MoveMoney key={open} category={category} flow={open} onClose={close} />
      )}
    </>
  );
}
