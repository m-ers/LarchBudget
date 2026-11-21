"use client";

import { useRef, useState } from "react";
import {
  createCategoryAction,
  deleteGroupAction,
  moveGroupAction,
  renameGroupAction,
  setGroupColorAction,
} from "@/app/actions";
import type { GroupRow } from "@/db/budget";
import { useT } from "@/i18n/client";
import type { Translate } from "@/i18n/translate";
import { groupColor, groupColorNames, groupColors } from "@/lib/group-colors";
import { formatAmount, formatMoney } from "@/lib/money";
import { ErrorText } from "../form";
import { EmptyToken, MoreIcon, PlusIcon } from "../icons";
import { InlineName, type InlineNameHandle } from "../inline-name";
import { Menu, useMenu } from "../menu";
import { useSave } from "../use-save";
import { AddByNameField, useAddByName } from "./add-by-name";
import { useBudget } from "./budget-context";
import { CategoryRow, formatSpent } from "./category-row";
import { onBand, RowAction, rowActionLook } from "./row-action";

/** What deleting a group does, asked before it happens. */
function deleteQuestion(t: Translate, name: string, categoryCount: number): string {
  if (categoryCount === 0) return t("budget.group.deleteEmpty", { name });
  return t("budget.group.deleteWithCategories", { name, count: categoryCount });
}

/**
 * One group in the budget table: its heading (rename, add category, and a
 * menu with the rest), its category rows and the inline "new category" field.
 */
export function GroupBody({
  group,
  first,
  last,
}: {
  group: GroupRow & { id: number };
  /** Whether it is the first or the last group, which cannot move further that way. */
  first: boolean;
  last: boolean;
}) {
  const t = useT();
  const { show } = useBudget();
  const { id, name, categories } = group;
  const isEmpty = categories.length === 0;
  // True while the "new category" field is in use.
  const [adding, setAdding] = useState(false);
  const adder = useAddByName((categoryName) => createCategoryAction(id, categoryName));
  // An empty group always shows its field: there is nothing else in it.
  const showField = isEmpty || adding || adder.pending || adder.error;
  const menu = useMenu();
  const nameField = useRef<InlineNameHandle>(null);
  // Moving the group; it reports a failure in the heading.
  const mover = useSave();

  // A failure is reported next to the "new category" field.
  function remove() {
    if (window.confirm(deleteQuestion(t, name, categories.length))) {
      adder.save(() => deleteGroupAction(id));
    }
  }

  return (
    <tbody>
      <GroupHeading group={group} onContextMenu={menu.openAtPointer}>
        <InlineName
          ref={nameField}
          value={name}
          label={t("budget.menu.groupName")}
          onSave={(text) => renameGroupAction(id, text)}
          className={`font-semibold tracking-[0.07em] uppercase ${onBand}`}
        />
        <RowAction
          label={t("budget.group.addCategoryLabel", { name })}
          title={t("budget.group.addCategoryTitle")}
          onClick={() => setAdding(true)}
          revealOn="head"
          className={onBand}
        >
          <PlusIcon width={15} height={15} />
        </RowAction>
        <Menu
          label={t("budget.menu.actionsForGroup", { name })}
          state={menu}
          colors={{
            label: t("budget.menu.groupColor"),
            choices: groupColors.map((color, i) => ({ color, name: t(groupColorNames[i]) })),
            current: group.colorSlot,
            onSelect: (slot) =>
              mover.save(
                () => setGroupColorAction(id, slot),
                undefined,
                undefined,
                () => show({ type: "color", groupId: id, slot }),
              ),
          }}
          buttonClassName={`${rowActionLook("head")} ${onBand}`}
          items={[
            { label: t("common.rename"), onSelect: () => nameField.current?.startEditing() },
            {
              label: t("budget.menu.moveUp"),
              onSelect: () => mover.save(() => moveGroupAction(id, "up")),
              disabled: first,
            },
            {
              label: t("budget.menu.moveDown"),
              onSelect: () => mover.save(() => moveGroupAction(id, "down")),
              disabled: last,
            },
            // Not while a new category is being added: the question would not count it.
            {
              label: t("budget.menu.deleteGroup"),
              onSelect: remove,
              destructive: true,
              disabled: adder.pending,
            },
          ]}
        >
          <MoreIcon width={15} height={15} />
        </Menu>
        <ErrorText
          error={mover.error}
          as="span"
          className="text-xs font-normal tracking-normal normal-case"
        />
      </GroupHeading>

      <CategoryRows group={group} />

      {showField && (
        <NewCategoryRow
          state={adder}
          label={t("budget.group.newCategoryLabel", { name })}
          placeholder={t("budget.group.newCategoryPlaceholder")}
          autoFocus={!isEmpty}
          onFocus={() => setAdding(true)}
          onLeave={() => setAdding(false)}
        />
      )}
    </tbody>
  );
}

/**
 * The row with the field that adds a category, at the end of a group or of
 * the income section.
 */
export function NewCategoryRow({
  state,
  label,
  placeholder,
  autoFocus,
  wide,
  onFocus,
  onLeave,
}: {
  state: ReturnType<typeof useAddByName>;
  /** Accessible name of the field. */
  label: string;
  placeholder: string;
  autoFocus: boolean;
  /** Room for a longer placeholder, such as one with an example. */
  wide?: boolean;
  /** Runs when the field gets the focus. */
  onFocus: () => void;
  /** Runs when the field loses focus, after what was typed was added or dropped. */
  onLeave: () => void;
}) {
  return (
    <tr className="data-row">
      <td className="h-[43px] w-[54px] pl-3.5">
        <EmptyToken />
      </td>
      <td colSpan={4}>
        <form onSubmit={state.submit} onFocus={onFocus} className="flex items-center gap-3">
          <AddByNameField
            state={state}
            label={label}
            placeholder={placeholder}
            autoFocus={autoFocus}
            wide={wide}
            className="text-[15.5px] font-medium"
            onLeave={onLeave}
          />
        </form>
      </td>
    </tr>
  );
}

/**
 * Expense categories without a group. The app never makes these; the section
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

/** The quiet band a section heading sits on, in the hover tone; see `onBand`. */
const band = "flex h-9 items-center bg-hover";
const total = `${band} justify-end text-[15px] font-medium whitespace-nowrap text-ink tabular-nums`;

/**
 * The heading row of a section of the budget table: its name and actions,
 * and in the columns what the section adds up to, all on a quiet band so
 * the totals read as the sum of the rows below.
 */
export function SectionHeading({
  totals,
  onContextMenu,
  children,
}: {
  /** What goes in the Assigned, Spent and Available columns. */
  totals: [assigned: string, spent: string, available: string];
  /** Opens the heading's menu on a right-click. */
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <tr className="group/head" onContextMenu={onContextMenu}>
      <th scope="rowgroup" colSpan={2} className="pt-2 text-left font-normal">
        <div
          className={`${band} gap-1 rounded-l-lg pl-3.5 text-xs tracking-[0.07em] text-muted uppercase`}
        >
          {children}
        </div>
      </th>
      <td className="pt-2">
        <div className={total}>{totals[0]}</div>
      </td>
      <td className="pt-2">
        <div className={total}>{totals[1]}</div>
      </td>
      <td className="pt-2">
        <div className={`${total} rounded-r-lg pr-6`}>{totals[2]}</div>
      </td>
    </tr>
  );
}

/** A group's heading: what its categories got assigned, spent and hold together. */
function GroupHeading({
  group,
  onContextMenu,
  children,
}: {
  group: GroupRow;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { currency, locale } = useBudget();
  const isEmpty = group.categories.length === 0;
  return (
    <SectionHeading
      totals={
        isEmpty
          ? ["", "", ""]
          : [
              formatAmount(group.assigned, currency, locale),
              formatSpent(group.activity, currency, locale),
              formatMoney(group.available, currency, locale),
            ]
      }
      onContextMenu={onContextMenu}
    >
      {children}
    </SectionHeading>
  );
}

function CategoryRows({ group }: { group: GroupRow }) {
  const color = groupColor(group.colorSlot);
  const { categories } = group;
  return categories.map((category, i) => (
    <CategoryRow
      key={category.id}
      category={category}
      color={color}
      place={{ groupId: group.id, first: i === 0, last: i === categories.length - 1 }}
    />
  ));
}
