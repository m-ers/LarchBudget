"use client";

import { useRef } from "react";
import {
  archiveCategoryAction,
  moveCategoryAction,
  moveCategoryToGroupAction,
  renameCategoryAction,
} from "@/app/actions";
import type { CategoryRow } from "@/db/budget";
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
  category: CategoryRow;
  place: Place;
  /** The row's menu, which a right-click on the row opens too. */
  menu: ReturnType<typeof useMenu>;
  /** Opens the form for moving money out of the category, or into it to cover overspending. */
  onMoveMoney: (flow: Flow) => void;
};

/**
 * Category name: click to rename. The category's actions are in a menu
 * beside it, whose button shows on row hover.
 */
export function CategoryName({ category, place, menu, onMoveMoney }: Props) {
  // `balance` is what the category holds over all time: what archiving gives back.
  const { id, name, balance, available } = category;
  const { currency, locale, figures } = useBudget();
  const { error, pending, save } = useSave();
  const nameField = useRef<InlineNameHandle>(null);

  function archive() {
    const question = `Archive "${name}"?`;
    const money = formatMoney(Math.abs(balance), currency, locale);
    const message =
      balance > 0
        ? `${question} Its ${money} goes back to Ready to assign.`
        : balance < 0
          ? `${question} It is overspent by ${money}, which then comes out of Ready to assign.`
          : question;
    if (window.confirm(message)) save(() => archiveCategoryAction(id));
  }

  return (
    <div className={`flex min-w-0 items-center gap-1 ${pending ? "opacity-60" : ""}`}>
      <InlineName
        ref={nameField}
        value={name}
        label="Category name"
        onSave={(text) => renameCategoryAction(id, text)}
        className="text-[15.5px] font-medium"
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
          ...figures.groups.flatMap(({ id: groupId, name: groupName }) =>
            groupId === null || groupId === place.groupId
              ? []
              : [
                  {
                    label: `Move to ${groupName}`,
                    onSelect: () => save(() => moveCategoryToGroupAction(id, groupId)),
                  },
                ],
          ),
          { label: "Move money…", onSelect: () => onMoveMoney("out") },
          ...(available < 0
            ? [{ label: "Cover overspending…", onSelect: () => onMoveMoney("in") }]
            : []),
          { label: "Archive", onSelect: archive, destructive: true },
        ]}
      >
        <MoreIcon width={15} height={15} />
      </Menu>
      <ErrorText error={error} as="span" className="text-xs" />
    </div>
  );
}
