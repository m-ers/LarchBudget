"use client";

import { useLayoutEffect, useRef } from "react";
import { setAssignedAction } from "@/app/actions";
import type { Month } from "@/lib/dates";
import { formatAmount, toInputValue } from "@/lib/money";
import { ErrorText } from "../form";
import { useInlineEdit } from "../use-inline-edit";

type Props = {
  categoryId: number;
  categoryName: string;
  month: Month;
  value: number;
  currency: string;
  locale: string;
};

/**
 * The amount assigned to one category this month. Shows a formatted number
 * until focused; saves on blur or Enter (Enter also jumps to the next row).
 */
export function AssignedInput({ categoryId, categoryName, month, value, currency, locale }: Props) {
  const edit = useInlineEdit(toInputValue(value, currency, locale), (typed) =>
    setAssignedAction(categoryId, month, typed),
  );
  const input = useRef<HTMLInputElement>(null);
  const selectOnEdit = useRef(false);

  // Select the whole amount when editing starts. This runs right after the
  // value switches to its editable form, before the next keystroke lands.
  useLayoutEffect(() => {
    if (selectOnEdit.current && edit.text !== null) {
      selectOnEdit.current = false;
      input.current?.select();
    }
  }, [edit.text]);

  return (
    <div className="-mr-2 flex flex-col items-end">
      <input
        ref={input}
        data-assigned
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={`Assigned to ${categoryName}`}
        aria-invalid={edit.error ? true : undefined}
        title={edit.error ?? undefined}
        placeholder={formatAmount(0, currency, locale)}
        value={edit.text ?? (value === 0 ? "" : formatAmount(value, currency, locale))}
        onChange={(e) => edit.setText(e.target.value)}
        onFocus={() => {
          if (edit.text === null) {
            selectOnEdit.current = true;
            edit.start();
          }
        }}
        onBlur={edit.commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // Only this table: Next.js can keep other visited pages mounted but hidden.
            const table = e.currentTarget.closest("table");
            const inputs = Array.from(
              table?.querySelectorAll<HTMLInputElement>("input[data-assigned]") ?? [],
            );
            const next = inputs[inputs.indexOf(e.currentTarget) + 1];
            if (next) next.focus();
            else e.currentTarget.blur();
          } else if (e.key === "Escape") {
            edit.cancel(e.currentTarget);
          }
        }}
        className={`w-28 rounded-md border bg-transparent px-2 py-[3px] text-right text-[15px] tabular-nums transition-colors placeholder:text-muted/40 focus:bg-surface focus:outline-none ${
          edit.error ? "border-bad" : "border-transparent hover:border-line focus:border-brand"
        } ${edit.pending ? "opacity-60" : ""}`}
      />
      <ErrorText error={edit.error} className="mt-1 text-xs" />
    </div>
  );
}
