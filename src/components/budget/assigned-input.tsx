"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { setAssignedAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { formatAmount, parseMoney, toInputValue } from "@/lib/money";
import { ErrorText } from "../form";
import { useSaveOnLeave } from "../use-inline-edit";
import { useSave } from "../use-save";
import { useBudget } from "./budget-context";

type Props = {
  categoryId: number;
  categoryName: string;
  /** Assigned in the viewed month, including a change still being saved. */
  value: number;
  /**
   * A quiet line under the amount, such as "€80 to go", with a sentence
   * that explains it on hover and to screen readers.
   */
  hint?: { text: string; tip: string };
};

/**
 * The Assigned field `step` rows up (-1) or down (1) from this one, if any.
 * Only in this table: Next.js can keep other visited pages mounted but hidden.
 */
function nearbyField(field: HTMLInputElement, step: number): HTMLInputElement | undefined {
  const table = field.closest("table");
  const fields = Array.from(
    table?.querySelectorAll<HTMLInputElement>("input[data-assigned]") ?? [],
  );
  return fields[fields.indexOf(field) + step];
}

/**
 * The amount assigned to one category this month. Shows a formatted number
 * until focused; saves when it is left. Enter, Tab and the arrow keys move
 * down or up the column, so amounts can be typed one after another;
 * Shift+Tab stays the browser's own, to reach the buttons in between.
 *
 * Leaving the field shows the new amount straight away, and every figure it
 * moves; the save follows. If the save fails, the old amount comes back with
 * the reason, and editing again starts from what was typed.
 */
export function AssignedInput({ categoryId, categoryName, value, hint }: Props) {
  const { month, currency, locale, show } = useBudget();
  const t = useT();
  const fieldId = useId();
  const tipId = useId();
  // null = not being edited, so the amount is shown.
  const [text, setText] = useState<string | null>(null);
  // What was typed for a save that failed, to start the next edit from.
  const [retry, setRetry] = useState<string | null>(null);
  const { error, setError, save } = useSave();
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

  function saveTyped() {
    if (text === null) return;
    const typed = text;
    setText(null);
    // Read the way the server reads it. What cannot be read is not shown;
    // the server says why.
    const amount = typed.trim() === "" ? 0 : parseMoney(typed, currency, locale);
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

  const { commit, cancel } = useSaveOnLeave(saveTyped, () => {
    setText(null);
    setRetry(null);
    setError(null);
  });

  return (
    <div className="-mr-2 flex flex-col items-end">
      <div className="relative">
        <input
          ref={input}
          id={fieldId}
          data-assigned
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={t("budget.row.assignedTo", { name: categoryName })}
          aria-describedby={hint ? tipId : undefined}
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
          onBlur={commit}
          onKeyDown={(e) => {
            // Keys that pick a character from an input method are not ours.
            if (e.nativeEvent.isComposing) return;
            const field = e.currentTarget;
            if (e.key === "Escape") {
              cancel(field);
              return;
            }
            const down =
              e.key === "Enter" || e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey);
            if (!down && e.key !== "ArrowUp") return;
            const next = nearbyField(field, down ? 1 : -1);
            // On the last field, Tab leaves the table and Enter just saves.
            if (next || e.key === "Enter") e.preventDefault();
            if (next) next.focus();
            else if (e.key === "Enter") field.blur();
          }}
          // scroll-mt: a field that gets focus scrolls into view below the sticky column headings.
          className={`peer w-28 scroll-mt-14 rounded-md border bg-transparent px-2 py-[3px] text-right text-[15px] tabular-nums transition-colors placeholder:text-muted/40 focus:bg-surface focus:outline-none ${
            error ? "border-bad" : "border-transparent hover:border-line focus:border-brand"
          }`}
        />
        {/* The hint sits in the field's lower edge, under the amount, so the
          amount stays in line with the rest of the row and the row keeps its
          height. It makes way while the field is edited, or has an error. A
          click on it goes to the field. */}
        {hint && !error && (
          <label
            htmlFor={fieldId}
            aria-hidden="true"
            title={hint.tip}
            className="absolute top-[24px] right-[7px] cursor-help bg-surface px-0.5 text-[11.5px] leading-none whitespace-nowrap text-muted tabular-nums peer-focus:invisible"
          >
            {hint.text}
          </label>
        )}
      </div>
      {hint && (
        // Hidden, but read as the field's description.
        <span id={tipId} hidden>
          {hint.tip}
        </span>
      )}
      <ErrorText error={error} className="mt-1 text-xs" />
    </div>
  );
}
