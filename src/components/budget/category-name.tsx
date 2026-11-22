"use client";

import { useEffect, useRef } from "react";
import {
  archiveCategoryAction,
  moveCategoryAction,
  moveCategoryToGroupAction,
  renameCategoryAction,
  setNextMonthAction,
} from "@/app/actions";
import { useDateLocale, useT } from "@/i18n/client";
import { addMonths, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { ErrorText } from "../form";
import { ArrowRightIcon, MoreIcon } from "../icons";
import { InlineName, type InlineNameHandle } from "../inline-name";
import { Menu, type useMenu } from "../menu";
import { useSave } from "../use-save";
import { useBudget } from "./budget-context";
import type { Flow } from "./move-money";
import { rowActionLook } from "./row-action";

/** Where a category is: its group, and whether it is that group's first or last. */
export type Place = { groupId: number | null; first: boolean; last: boolean };

type Props = {
  category: { id: number; name: string };
  place: Place;
  /** The row's menu, which a right-click on the row opens too. */
  menu: ReturnType<typeof useMenu>;
  /**
   * For an expense category: what it holds over all time (what archiving
   * gives back) and this month, whether it has a target, and opening the
   * form for moving money out of it, or into it to cover overspending, or
   * the form for its target. Left out for an income category, which holds
   * no money and has no group to leave.
   */
  money?: {
    balance: number;
    available: number;
    hasTarget: boolean;
    onMoveMoney: (flow: Flow) => void;
    onTarget: () => void;
  };
  /**
   * For an income category: whether what comes in counts for the next month,
   * which its menu switches. Left out for an expense category.
   */
  nextMonth?: boolean;
  /** Why choosing the row's icon failed, reported here with the row's other failures. */
  iconError?: string | null;
};

/** The category that was just moved to another group, until its new row has the focus. */
let movedToGroup: number | null = null;

/**
 * Category name: click to rename. The category's actions are in a menu
 * beside it, whose button shows on row hover.
 */
export function CategoryName({
  category: { id, name },
  place,
  menu,
  money,
  nextMonth,
  iconError,
}: Props) {
  const { month, currency, locale, figures, show } = useBudget();
  const dates = useDateLocale();
  const t = useT();
  const { error, pending, save } = useSave();
  const nameField = useRef<InlineNameHandle>(null);

  // In another group the row is built anew, and the menu button that had
  // the focus is gone: give it to the new row's button.
  const menuButton = menu.button;
  useEffect(() => {
    if (movedToGroup !== id) return;
    movedToGroup = null;
    menuButton.current?.focus();
  }, [id, menuButton]);

  function archive() {
    const balance = money?.balance ?? 0;
    const amount = formatMoney(Math.abs(balance), currency, locale);
    const message =
      balance > 0
        ? t("budget.archiveConfirm.positive", { name, amount })
        : balance < 0
          ? t("budget.archiveConfirm.negative", { name, amount })
          : t("budget.archiveConfirm.plain", { name });
    if (window.confirm(message)) save(() => archiveCategoryAction(id));
  }

  // Only an expense category is in a group and holds money.
  const expenseItems = money
    ? [
        ...figures.groups.flatMap(({ id: groupId, name: groupName }) =>
          groupId === null || groupId === place.groupId
            ? []
            : [
                {
                  label: t("budget.menu.moveTo", { group: groupName }),
                  onSelect: () => {
                    movedToGroup = id;
                    save(
                      () => moveCategoryToGroupAction(id, groupId),
                      undefined,
                      () => (movedToGroup = null),
                    );
                  },
                },
              ],
        ),
        { label: t("budget.menu.moveMoney"), onSelect: () => money.onMoveMoney("out") },
        ...(money.available < 0
          ? [
              {
                label: t("budget.menu.coverOverspending"),
                onSelect: () => money.onMoveMoney("in"),
              },
            ]
          : []),
        {
          label: money.hasTarget ? t("budget.menu.changeTarget") : t("budget.menu.setTarget"),
          onSelect: money.onTarget,
        },
      ]
    : [];

  // Only an income category receives money, for its own month or the next.
  const incomeItems =
    nextMonth === undefined
      ? []
      : [
          {
            label: t("budget.income.nextMonth"),
            checked: nextMonth,
            onSelect: () =>
              save(
                () => setNextMonthAction(id, !nextMonth),
                undefined,
                undefined,
                () => show({ type: "next-month", categoryId: id, on: !nextMonth }),
              ),
          },
        ];

  return (
    <div className="flex min-w-0 items-center gap-1">
      {/* Only the name dims while a change is saved: dimming the menu too
          would let the rows below show, and be clicked, through it. */}
      <InlineName
        ref={nameField}
        value={name}
        label={t("budget.menu.categoryName")}
        onSave={(text) => renameCategoryAction(id, text)}
        className={`text-[15.5px] font-medium ${pending ? "opacity-60" : ""}`}
      />
      {nextMonth && (
        // What it shows came in the month before: say so, without a word in the row.
        <span
          title={t("budget.income.nextMonthHint", {
            month: formatMonth(addMonths(month, -1), dates),
          })}
          className="flex shrink-0 cursor-help text-muted"
        >
          <ArrowRightIcon width={15} height={15} aria-hidden="true" />
          <span className="sr-only">
            {t("budget.income.nextMonthHint", {
              month: formatMonth(addMonths(month, -1), dates),
            })}
          </span>
        </span>
      )}
      <Menu
        label={t("budget.menu.actionsFor", { name })}
        state={menu}
        buttonClassName={rowActionLook("row")}
        items={[
          { label: t("common.rename"), onSelect: () => nameField.current?.startEditing() },
          {
            label: t("budget.menu.moveUp"),
            onSelect: () => save(() => moveCategoryAction(id, "up")),
            disabled: place.first,
          },
          {
            label: t("budget.menu.moveDown"),
            onSelect: () => save(() => moveCategoryAction(id, "down")),
            disabled: place.last,
          },
          ...expenseItems,
          ...incomeItems,
          { label: t("budget.menu.archive"), onSelect: archive, destructive: true },
        ]}
      >
        <MoreIcon width={15} height={15} />
      </Menu>
      <ErrorText error={error ?? iconError} as="span" className="text-xs" />
    </div>
  );
}
