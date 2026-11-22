"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { setAssignedAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { formatAmount, parseMoney, toInputValue } from "@/lib/money";
import { ErrorText } from "../form";
import { TargetIcon } from "../icons";
import { useSaveOnLeave } from "../use-inline-edit";
import { useSave } from "../use-save";
import { useBudget } from "./budget-context";

/** The category's target, as the mark at the start of the field shows it. */
export type TargetMark =
  | {
      /** It needs money in the viewed month. */
      asks: true;
      /** What it still needs, above zero. */
      needed: number;
      /** "Target: top up to €400 · €80 to go.": the field's description. */
      status: string;
      /** The tooltip: `status`, and that a click assigns it. */
      tip: string;
      /** The name of the button that assigns it: "Assign the target for Groceries: €80". */
      label: string;
      /** What the status line says once it is assigned. */
      done: string;
    }
  | {
      /** Reached, or a month in which it asks nothing. */
      asks: false;
      /** "Target: top up to €400 · reached.": the tooltip and the field's description. */
      status: string;
    };

type Props = {
  categoryId: number;
  categoryName: string;
  /** Assigned in the viewed month, including a change still being saved. */
  value: number;
  /** Its target; left out when it has none. */
  target?: TargetMark;
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
 *
 * A category with a target has a ◎ at the start of the field. While the
 * target needs money, it is in colour and a button that assigns what is
 * missing, the same way as typing the amount; an empty field then shows the
 * amount the target asks for, faded, as not assigned yet. Once reached, or
 * in a month that is over, it is grey and only says what the target is.
 * The button comes before the field when tabbing, so Shift+Tab reaches it;
 * Tab and the arrow keys in the column go from field to field past it.
 */
export function AssignedInput({ categoryId, categoryName, value, target }: Props) {
  const { month, currency, locale, show, announce } = useBudget();
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
  const box = useRef<HTMLDivElement>(null);
  // Whether the ◎ had the focus when it was used, so that it keeps it once
  // it has turned from a button into a mark, or back when the save failed.
  const markHadFocus = useRef(false);
  const asks = target?.asks ?? false;

  useLayoutEffect(() => {
    if (!markHadFocus.current) return;
    markHadFocus.current = false;
    box.current?.querySelector<HTMLElement>("[data-target-mark]")?.focus();
  }, [asks]);

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

  /** Assigns what the target is missing: what typing that amount would do. */
  function assignTarget(button: HTMLButtonElement) {
    if (!target?.asks) return;
    const { needed, done } = target;
    const amount = value + needed;
    markHadFocus.current = document.activeElement === button;
    announce("");
    save(
      () => setAssignedAction(categoryId, month, toInputValue(amount, currency, locale)),
      () => {
        setRetry(null);
        announce(done);
      },
      () => {
        markHadFocus.current =
          document.activeElement === box.current?.querySelector("[data-target-mark]");
      },
      () => show({ type: "assign", categoryId, amount }),
    );
  }

  const markLook =
    "absolute top-1/2 left-[3px] grid size-[22px] -translate-y-1/2 place-items-center rounded-[5px] focus-visible:outline-offset-0!";

  return (
    <div className="-mr-2 flex flex-col items-end">
      <div ref={box} className="relative">
        {/* Before the field, for the order in which Tab reaches it; drawn
            over its start. */}
        {target?.asks ? (
          <button
            type="button"
            data-target-mark
            aria-label={target.label}
            title={target.tip}
            onClick={(e) => assignTarget(e.currentTarget)}
            className={`${markLook} text-brand transition-colors hover:bg-ok-track`}
          >
            <TargetIcon width={14} height={14} strokeWidth={2.2} />
          </button>
        ) : (
          target && (
            // A click on it goes to the field, as one beside it would.
            <label
              htmlFor={fieldId}
              data-target-mark
              tabIndex={-1}
              title={target.status}
              className={`${markLook} text-muted/45`}
            >
              <TargetIcon width={14} height={14} strokeWidth={2.2} />
              <span className="sr-only">{target.status}</span>
            </label>
          )
        )}
        <input
          ref={input}
          id={fieldId}
          data-assigned
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={t("budget.row.assignedTo", { name: categoryName })}
          aria-describedby={target ? tipId : undefined}
          aria-invalid={error ? true : undefined}
          title={error ?? undefined}
          // Empty while its target asks for money: what it asks, faded.
          placeholder={formatAmount(
            target?.asks && value === 0 ? target.needed : 0,
            currency,
            locale,
          )}
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
          // With a target, the ◎ takes the start of the field; the width stays.
          className={`w-28 scroll-mt-14 rounded-md border bg-transparent py-[3px] pr-2 text-right text-[15px] tabular-nums transition-colors focus:bg-surface focus:outline-none ${
            target ? "pl-[26px]" : "pl-2"
          } ${target?.asks && value === 0 ? "placeholder:text-muted/70" : "placeholder:text-muted/40"} ${
            error ? "border-bad" : "border-transparent hover:border-line focus:border-brand"
          }`}
        />
      </div>
      {target && (
        // Hidden, but read as the field's description.
        <span id={tipId} hidden>
          {target.status}
        </span>
      )}
      <ErrorText error={error} className="mt-1 text-xs" />
    </div>
  );
}
