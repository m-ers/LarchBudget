"use client";

import { useEffect, useRef } from "react";
import {
  archiveCategoryAction,
  moveCategoryAction,
  moveCategoryToGroupAction,
  renameCategoryAction,
} from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { ErrorText } from "../form";
import { MoreIcon } from "../icons";
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
   * gives back) and this month, and opening the form for moving money out
   * of it, or into it to cover overspending. Left out for an income
   * category, which holds no money and has no group to leave.
   */
  money?: { balance: number; available: number; onMoveMoney: (flow: Flow) => void };
};

/** The category that was just moved to another group, until its new row has the focus. */
let movedToGroup: number | null = null;

/**
 * Category name: click to rename. The category's actions are in a menu
 * beside it, whose button shows on row hover.
 */
export function CategoryName({ category: { id, name }, place, menu, money }: Props) {
  const { currency, locale, figures } = useBudget();
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
    const question = `Archive "${name}"?`;
    const balance = money?.balance ?? 0;
    const amount = formatMoney(Math.abs(balance), currency, locale);
    const message =
      balance > 0
        ? `${question} Its ${amount} goes back to Ready to assign.`
        : balance < 0
          ? `${question} It is overspent by ${amount}, which then comes out of Ready to assign.`
          : question;
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
                  label: `Move to ${groupName}`,
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
        { label: "Move money…", onSelect: () => money.onMoveMoney("out") },
        ...(money.available < 0
          ? [{ label: "Cover overspending…", onSelect: () => money.onMoveMoney("in") }]
          : []),
      ]
    : [];

  return (
    <div className="flex min-w-0 items-center gap-1">
      {/* Only the name dims while a change is saved: dimming the menu too
          would let the rows below show, and be clicked, through it. */}
      <InlineName
        ref={nameField}
        value={name}
        label="Category name"
        onSave={(text) => renameCategoryAction(id, text)}
        className={`text-[15.5px] font-medium ${pending ? "opacity-60" : ""}`}
      />
      <Menu
        label={`Actions for ${name}`}
        state={menu}
        buttonClassName={rowActionLook("row")}
        items={[
          { label: "Rename", onSelect: () => nameField.current?.startEditing() },
          {
            label: "Move up",
            onSelect: () => save(() => moveCategoryAction(id, "up")),
            disabled: place.first,
          },
          {
            label: "Move down",
            onSelect: () => save(() => moveCategoryAction(id, "down")),
            disabled: place.last,
          },
          ...expenseItems,
          { label: "Archive", onSelect: archive, destructive: true },
        ]}
      >
        <MoreIcon width={15} height={15} />
      </Menu>
      <ErrorText error={error} as="span" className="text-xs" />
    </div>
  );
}
