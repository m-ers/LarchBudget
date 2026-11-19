"use client";

import { useState } from "react";
import { createCategoryAction, deleteGroupAction, renameGroupAction } from "@/app/actions";
import { EmptyToken, PlusIcon, TrashIcon } from "../icons";
import { InlineName } from "../inline-name";
import { AddByNameField, useAddByName } from "./add-by-name";
import { RowAction } from "./row-action";

type Props = {
  /** Null for the fallback section of categories without a group, which cannot be changed. */
  id: number | null;
  name: string;
  /** What the group's categories hold together, formatted as money. */
  total: string;
  /** How many visible categories the group has. */
  categoryCount: number;
  /** The category rows, rendered on the server. */
  children: React.ReactNode;
};

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
export function GroupBody({ id, name, total, categoryCount, children }: Props) {
  const isEmpty = categoryCount === 0;
  // True while the "new category" field is in use.
  const [adding, setAdding] = useState(false);
  const adder = useAddByName(async (categoryName) =>
    id === null
      ? { ok: false, error: "Categories cannot be added here." }
      : createCategoryAction(id, categoryName),
  );
  // An empty group always shows its field: there is nothing else in it.
  const showField = (isEmpty && id !== null) || adding || adder.pending || adder.error;

  function remove(groupId: number) {
    // A failure is reported next to the "new category" field.
    if (window.confirm(deleteQuestion(name, categoryCount))) {
      adder.save(() => deleteGroupAction(groupId));
    }
  }

  return (
    <tbody>
      <tr className="group/head">
        <th scope="rowgroup" colSpan={4} className="h-[38px] pt-1 pl-3.5 text-left font-normal">
          <div className="flex items-center gap-1 text-xs tracking-[0.07em] text-muted uppercase">
            {id === null ? (
              <span className="font-semibold">{name}</span>
            ) : (
              <>
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
                  revealOn="head"
                >
                  <PlusIcon width={15} height={15} />
                </RowAction>
                <RowAction
                  label={`Delete the group ${name}`}
                  title="Delete group"
                  onClick={() => remove(id)}
                  revealOn="head"
                  keepFocus
                >
                  <TrashIcon width={15} height={15} />
                </RowAction>
              </>
            )}
          </div>
        </th>
        <td className="h-[38px] pt-1 pr-6 text-right text-[13.5px] text-muted tabular-nums">
          {isEmpty ? "" : total}
        </td>
      </tr>

      {children}

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
