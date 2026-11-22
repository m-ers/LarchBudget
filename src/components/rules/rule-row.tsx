"use client";

import { useRef, useState } from "react";
import { deleteRuleAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { rulePlace } from "@/lib/rules";
import { RowAction } from "../budget/row-action";
import { ErrorText } from "../form";
import { PencilIcon, TrashIcon } from "../icons";
import { useSave } from "../use-save";
import { RuleForm } from "./rule-form";

export type RuleItem = {
  id: number;
  text: string;
  categoryId: number | null;
  category: string | null;
  categoryArchived: boolean;
  /** How many transactions it sorted that nobody has changed since. */
  sorted: number;
};

/**
 * One rule in the table: what it looks for, where it sends transactions, and
 * how many it sorted. On hover, change it in a form under its row, or delete it.
 */
export function RuleRow({ rule }: { rule: RuleItem }) {
  const { id, text, categoryId, category, categoryArchived, sorted } = rule;
  const t = useT();
  const [editing, setEditing] = useState(false);
  // How many transactions the last change sorted or moved, to say so under the text.
  const [justSorted, setJustSorted] = useState(0);
  const { error, pending, save } = useSave();
  const editButton = useRef<HTMLButtonElement>(null);

  function remove() {
    if (window.confirm(t("rules.row.deleteQuestion", { text }))) {
      save(() => deleteRuleAction(id));
    }
  }

  const where =
    categoryId === null
      ? t("rules.table.noCategory")
      : categoryArchived
        ? t("transactions.picker.archived", { name: category ?? "" })
        : category;

  return (
    <>
      <tr className="data-row group/row">
        <td className="h-[50px] max-w-0 pl-3.5">
          <div className={`flex min-w-0 items-center gap-1 ${pending ? "opacity-60" : ""}`}>
            <span className="truncate text-[15.5px] font-medium">{text}</span>
          </div>
          {justSorted > 0 && (
            <p role="status" className="text-[13px] text-muted">
              {t("rules.row.justSorted", { count: justSorted })}
            </p>
          )}
          <ErrorText error={error} className="pb-1.5 text-xs" />
        </td>
        <td
          className={`truncate pr-3 ${categoryArchived ? "text-muted" : ""}`}
          title={categoryArchived ? t("rules.row.archivedTip") : undefined}
        >
          {where}
        </td>
        <td className="text-right text-muted tabular-nums">{sorted}</td>
        <td className="pr-2.5">
          <span className="flex items-center justify-end">
            <RowAction
              ref={editButton}
              label={t("rules.row.editLabel", { text })}
              title={t("rules.row.editTitle")}
              onClick={() => {
                setJustSorted(0);
                setEditing((was) => !was);
              }}
              revealOn={editing ? undefined : "row"}
              expanded={editing}
            >
              <PencilIcon width={15} height={15} />
            </RowAction>
            <RowAction
              label={t("rules.row.deleteLabel", { text })}
              title={t("rules.row.deleteTitle")}
              onClick={remove}
              revealOn="row"
            >
              <TrashIcon width={15} height={15} />
            </RowAction>
          </span>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={4} className="px-1 pt-1 pb-3">
            <RuleForm
              ruleId={id}
              layout="inline"
              label={t("rules.row.editLabel", { text })}
              submitLabel={t("rules.form.save")}
              text={text}
              place={rulePlace(categoryId)}
              archived={
                categoryArchived && categoryId !== null
                  ? new Map([[categoryId, category ?? ""]])
                  : undefined
              }
              onSaved={setJustSorted}
              onClose={(byKeyboard) => {
                setEditing(false);
                if (byKeyboard) editButton.current?.focus();
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}
