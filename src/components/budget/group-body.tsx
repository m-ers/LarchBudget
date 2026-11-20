"use client";

import { useState } from "react";
import { createCategoryAction, deleteGroupAction, renameGroupAction } from "@/app/actions";
import type { GroupRow } from "@/db/budget";
import { groupColor } from "@/lib/group-colors";
import { formatMoney } from "@/lib/money";
import { EmptyToken, PlusIcon, TrashIcon } from "../icons";
import { InlineName } from "../inline-name";
import { AddByNameField, useAddByName } from "./add-by-name";
import { useBudget } from "./budget-context";
import { CategoryRow } from "./category-row";
import { RowAction } from "./row-action";

/** What deleting a group does, asked before it happens. */
function deleteQuestion(name: string, categoryCount: number): string {
  const question = `Delete the group "${name}"?`;
  if (categoryCount === 0) return question;
  return categoryCount === 1
    ? `${question} Its category will be archived, and the money in it goes back to Ready to assign.`
    : `${question} Its ${categoryCount} categories will be archived, and the money in them goes back to Ready to assign.`;
}

/**
 * One group in the budget table: its heading (rename, add category,
 * delete), its category rows and the inline "new category" field.
 */
export function GroupBody({ group }: { group: GroupRow & { id: number } }) {
  const { id, name, categories } = group;
  const isEmpty = categories.length === 0;
  // True while the "new category" field is in use.
  const [adding, setAdding] = useState(false);
  const adder = useAddByName((categoryName) => createCategoryAction(id, categoryName));
  // An empty group always shows its field: there is nothing else in it.
  const showField = isEmpty || adding || adder.pending || adder.error;

  function remove() {
    // A failure is reported next to the "new category" field.
    if (window.confirm(deleteQuestion(name, categories.length))) {
      adder.save(() => deleteGroupAction(id));
    }
  }

  return (
    <tbody>
      <GroupHeading group={group}>
        <InlineName
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
        <RowAction
          label={`Delete the group ${name}`}
          title="Delete group"
          onClick={remove}
          revealOn="head"
          keepFocus
        >
          <TrashIcon width={15} height={15} />
        </RowAction>
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

/** A group's heading row: its name and actions, and what its categories hold together. */
function GroupHeading({ group, children }: { group: GroupRow; children: React.ReactNode }) {
  const { currency, locale } = useBudget();
  return (
    <tr className="group/head">
      <th scope="rowgroup" colSpan={4} className="h-[38px] pt-1 pl-3.5 text-left font-normal">
        <div className="flex items-center gap-1 text-xs tracking-[0.07em] text-muted uppercase">
          {children}
        </div>
      </th>
      <td className="h-[38px] pt-1 pr-6 text-right text-[13.5px] text-muted tabular-nums">
        {group.categories.length === 0 ? "" : formatMoney(group.available, currency, locale)}
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
