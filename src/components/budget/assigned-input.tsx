"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { setAssignedAction } from "@/app/actions";
import { formatAmount, parseMoney, toInputValue } from "@/lib/money";
import { ErrorText } from "../form";
import { windowLostFocus } from "../use-inline-edit";
import { useSave } from "../use-save";
import { useBudget } from "./budget-context";

type Props = {
  categoryId: number;
  categoryName: string;
  /** Assigned in the viewed month, including a change still being saved. */
  value: number;
};

/**
 * The amount assigned to one category this month. Shows a formatted number
 * until focused; saves on blur or Enter (Enter also jumps to the next row).
 *
 * Leaving the field shows the new amount straight away, and every figure it
 * moves; the save follows. If the save fails, the old amount comes back with
 * the reason, and editing again starts from what was typed.
 */
export function AssignedInput({ categoryId, categoryName, value }: Props) {
  const { month, currency, locale, show } = useBudget();
  // null = not being edited, so the amount is shown.
  const [text, setText] = useState<string | null>(null);
  // What was typed for a save that failed, to start the next edit from.
  const [retry, setRetry] = useState<string | null>(null);
  const { error, setError, save } = useSave();
  const cancelled = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const selectOnEdit = useRef(false);

  // Select the whole amount when editing starts. This runs right after the
  // value switches to its editable form, before the next keystroke lands.
  useLayoutEffect(() => {
    if (selectOnEdit.current && text !== null) {
      selectOnEdit.current = false;
      input.current?.select();
    }
  }, [text]);

  function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text === null) return;
    const typed = text;
    setText(null);
    // Read the way the server reads it. What cannot be read is not shown;
    // the server says why.
    const amount = typed.trim() === "" ? 0 : parseMoney(typed, currency);
    if (amount === value) {
      setRetry(null);
      setError(null);
      return;
    }
    save(
      () => setAssignedAction(categoryId, month, typed),
      () => setRetry(null),
      () => setRetry(typed),
      () => {
        if (amount !== null) show({ type: "assign", categoryId, amount });
      },
    );
  }

  /**
   * For the Escape key: drops what was typed. Blurring the field here makes
   * `commit` run now and see the cancel.
   */
  function cancel(field: HTMLElement) {
    cancelled.current = true;
    setText(null);
    setRetry(null);
    setError(null);
    field.blur();
  }

  return (
    <div className="-mr-2 flex flex-col items-end">
      <input
        ref={input}
        data-assigned
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={`Assigned to ${categoryName}`}
        aria-invalid={error ? true : undefined}
        title={error ?? undefined}
        placeholder={formatAmount(0, currency, locale)}
        value={text ?? (value === 0 ? "" : formatAmount(value, currency, locale))}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => {
          if (text === null) {
            selectOnEdit.current = true;
            setText(retry ?? toInputValue(value, currency, locale));
          }
        }}
        onBlur={(e) => {
          if (!windowLostFocus(e)) commit();
        }}
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
            cancel(e.currentTarget);
          }
        }}
        className={`w-28 rounded-md border bg-transparent px-2 py-[3px] text-right text-[15px] tabular-nums transition-colors placeholder:text-muted/40 focus:bg-surface focus:outline-none ${
          error ? "border-bad" : "border-transparent hover:border-line focus:border-brand"
        }`}
      />
      <ErrorText error={error} className="mt-1 text-xs" />
    </div>
  );
}
