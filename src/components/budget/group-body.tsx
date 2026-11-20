"use client";

import { useRef, useState } from "react";
import { createCategoryAction, deleteGroupAction, renameGroupAction } from "@/app/actions";
import type { GroupRow } from "@/db/budget";
import { groupColor } from "@/lib/group-colors";
import { formatAmount, formatMoney } from "@/lib/money";
import { EmptyToken, MoreIcon, PlusIcon } from "../icons";
import { InlineName, type InlineNameHandle } from "../inline-name";
import { Menu, useMenu } from "../menu";
import { AddByNameField, useAddByName } from "./add-by-name";
import { useBudget } from "./budget-context";
import { CategoryRow, formatSpent } from "./category-row";
import { RowAction, rowActionLook } from "./row-action";

/** What deleting a group does, asked before it happens. */
function deleteQuestion(name: string, categoryCount: number): string {
  const question = `Delete the group "${name}"?`;
  if (categoryCount === 0) return question;
  return categoryCount === 1
    ? `${question} Its category will be archived, and the money in it goes back to Ready to assign.`
    : `${question} Its ${categoryCount} categories will be archived, and the money in them goes back to Ready to assign.`;
}

/**
 * One group in the budget table: its heading (rename, add category, and a
 * menu with the rest), its category rows and the inline "new category" field.
 */
export function GroupBody({ group }: { group: GroupRow & { id: number } }) {
  const { id, name, categories } = group;
  const isEmpty = categories.length === 0;
  // True while the "new category" field is in use.
  const [adding, setAdding] = useState(false);
  const adder = useAddByName((categoryName) => createCategoryAction(id, categoryName));
  // An empty group always shows its field: there is nothing else in it.
  const showField = isEmpty || adding || adder.pending || adder.error;
  const menu = useMenu();
  const nameField = useRef<InlineNameHandle>(null);

  function remove() {
    // A failure is reported next to the "new category" field.
    if (window.confirm(deleteQuestion(name, categories.length))) {
      adder.save(() => deleteGroupAction(id));
    }
  }

  return (
    <tbody>
      <GroupHeading group={group} onContextMenu={menu.openAtPointer}>
        <InlineName
          ref={nameField}
          value={name}
          label="Group name"
          onSave={(text) => renameGroupAction(id, text)}
          className="font-semibold tracking-[0.07em] uppercase"
        />
        <RowAction
          label={`Add a category to ${name}`}
          title="Add category"
          onClick={() => setAdding(true)}
        >
          <PlusIcon width={15} height={15} />
        </RowAction>
        <Menu
          label={`Actions for the group ${name}`}
          state={menu}
          buttonClassName={rowActionLook("head")}
          items={[
            { label: "Rename", onSelect: () => nameField.current?.startEditing() },
            { label: "Delete group", onSelect: remove, destructive: true },
          ]}
        >
          <MoreIcon width={15} height={15} />
        </Menu>
      </GroupHeading>

      <CategoryRows group={group} />

      {showField && (
        <tr className="data-row">
          <td className="h-[43px] w-[54px] pl-3.5">
            <EmptyToken />
          </td>
          <td colSpan={4}>
            <form
              onSubmit={adder.submit}
              onFocus={() => setAdding(true)}
              className="flex items-center gap-3"
            >
              <AddByNameField
                state={adder}
                label={`New category in ${name}`}
                placeholder="New category"
                autoFocus={!isEmpty}
                className="text-[15.5px] font-medium"
                onLeave={() => setAdding(false)}
              />
            </form>
          </td>
        </tr>
      )}
    </tbody>
  );
}

/**
 * Categories without a group. The app never makes these; the section
 * covers a hand-edited database, so it has no actions of its own.
 */
export function UngroupedBody({ group }: { group: GroupRow }) {
  return (
    <tbody>
      <GroupHeading group={group}>
        <span className="font-semibold">{group.name}</span>
      </GroupHeading>
      <CategoryRows group={group} />
    </tbody>
  );
}

const total = "h-[38px] pt-1 text-right text-[13.5px] text-muted tabular-nums";

/**
 * A group's heading row: its name and actions, and in the columns what its
 * categories got assigned, spent and hold together.
 */
function GroupHeading({
  group,
  onContextMenu,
  children,
}: {
  group: GroupRow;
  /** Opens the heading's menu on a right-click. */
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { currency, locale } = useBudget();
  const isEmpty = group.categories.length === 0;
  return (
    <tr className="group/head" onContextMenu={onContextMenu}>
      <th scope="rowgroup" colSpan={2} className="h-[38px] pt-1 pl-3.5 text-left font-normal">
        <div className="flex items-center gap-1 text-xs tracking-[0.07em] text-muted uppercase">
          {children}
        </div>
      </th>
      <td className={total}>{isEmpty ? "" : formatAmount(group.assigned, currency, locale)}</td>
      <td className={total}>{isEmpty ? "" : formatSpent(group.activity, currency, locale)}</td>
      <td className={`${total} pr-6`}>
        {isEmpty ? "" : formatMoney(group.available, currency, locale)}
      </td>
    </tr>
  );
}

function CategoryRows({ group }: { group: GroupRow }) {
  const color = groupColor(group.colorSlot);
  return group.categories.map((category) => (
    <CategoryRow key={category.id} category={category} color={color} />
  ));
}
