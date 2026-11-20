"use client";

import { useContext, useRef, useState } from "react";
import { sortTransactionAction } from "@/app/actions";
import type { SortTarget, Suggestion } from "@/db/transactions";
import { ErrorText } from "../form";
import { windowLostFocus } from "../use-inline-edit";
import { useSave } from "../use-save";
import { CategoryChoices } from "./category-choices";

type Props = {
  transactionId: number;
  /** What the transaction is about, for screen readers. */
  describedAs: string;
  /** The amount as shown, so two payments to one payee on one day can be told apart. */
  amount: string;
  categoryId: number | null;
  /** The category's name; needed when it is archived and so not in the list. */
  categoryName: string | null;
  categoryArchived: boolean;
  toSort: boolean;
  /** Where this payee was sorted last time, for a transaction still to sort. */
  suggestion?: Suggestion;
};

const UNSORTED = "unsorted";
const NO_CATEGORY = "ready";

/**
 * Chooses where a transaction belongs.
 *
 * A choice made with the mouse is saved at once. With the keyboard, arrow
 * keys and typing only browse the list (a closed dropdown reports every one
 * of those as a change); the choice is saved on Enter or when leaving the
 * field, and Escape puts the old value back. A choice is shown at once and
 * focus moves to the next transaction without waiting for the server, so a
 * list can be worked through quickly. A suggestion is a button that makes
 * the same choice.
 *
 * Every row would otherwise hold every category, which makes a long list
 * slow to draw. A row draws the full list only while it is being used.
 */
export function CategorySelect({
  transactionId,
  describedAs,
  amount,
  categoryId,
  categoryName,
  categoryArchived,
  toSort,
  suggestion,
}: Props) {
  const groups = useContext(CategoryChoices);
  const cell = useRef<HTMLSpanElement>(null);
  const browsingByKeyboard = useRef(false);
  // One row saves one choice at a time; other rows are not held up by it.
  const saving = useRef(false);
  const [listDrawn, setListDrawn] = useState(false);
  // A value picked that is not saved yet, or is on its way to the server.
  const [draft, setDraft] = useState<string | null>(null);
  const { error, setError, save: run } = useSave();

  const saved = toSort ? UNSORTED : categoryId === null ? NO_CATEGORY : String(categoryId);
  const shown = draft ?? saved;

  function focusNextRow() {
    // The next row with something to sort. This row may leave the list once saved.
    let row = cell.current?.closest("tr")?.nextElementSibling;
    while (row) {
      const control = row.querySelector<HTMLElement>("[data-sort-control]");
      if (control) return control.focus();
      row = row.nextElementSibling;
    }
  }

  function save(next: string, thenFocusNext: boolean) {
    if (saving.current) return;
    if (next === saved) {
      setDraft(null);
      return;
    }
    const target: SortTarget = next === UNSORTED || next === NO_CATEGORY ? next : Number(next);

    saving.current = true;
    setDraft(next);
    if (thenFocusNext) focusNextRow();
    const finished = () => {
      saving.current = false;
      setDraft(null);
    };
    run(() => sortTransactionAction(transactionId, target), finished, finished);
  }

  /** The name of the category with this value, while the full list is not drawn. */
  function nameOf(value: string) {
    if (value === String(categoryId)) return categoryName;
    for (const group of groups) {
      const found = group.categories.find((category) => String(category.id) === value);
      if (found) return found.name;
    }
    return null;
  }

  const shownIsCategory = shown !== UNSORTED && shown !== NO_CATEGORY;
  const archivedIsCurrent = categoryArchived && categoryId !== null;
  const suggested = suggestion?.categoryId == null ? NO_CATEGORY : String(suggestion.categoryId);

  return (
    <span ref={cell} className="flex flex-col">
      <span className="flex items-center gap-1.5">
        {toSort && suggestion && (
          <button
            type="button"
            data-sort-control
            aria-label={`Sort ${describedAs} into ${suggestion.category ?? "No category"}, as last time`}
            title="Same as last time"
            onClick={() => save(suggested, true)}
            className="max-w-32 truncate rounded-[9px] border border-brand/50 px-2.5 py-1.5 text-[14.5px] font-medium text-brand transition-colors hover:bg-ok-track focus-visible:border-brand focus-visible:outline-none"
          >
            {suggestion.category ?? "No category"}
          </button>
        )}
        <select
          data-sort-control
          aria-label={`Category for ${describedAs}, ${amount}`}
          aria-invalid={error ? true : undefined}
          value={shown}
          onFocus={() => setListDrawn(true)}
          onPointerDown={() => {
            browsingByKeyboard.current = false;
            setListDrawn(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save(shown, true);
            } else if (e.key === "Escape") {
              setDraft(null);
              setError(null);
            } else {
              browsingByKeyboard.current = true;
            }
          }}
          onChange={(e) => {
            if (browsingByKeyboard.current) setDraft(e.target.value);
            else save(e.target.value, true);
          }}
          onBlur={(e) => {
            // Switching to another window is not a choice.
            if (windowLostFocus(e)) return;
            browsingByKeyboard.current = false;
            setListDrawn(false);
            if (draft !== null) save(draft, false);
          }}
          className={`w-64 rounded-[9px] border px-2.5 py-1.5 text-[14.5px] focus:border-brand focus:outline-none ${
            shown === UNSORTED
              ? "border-brand/50 bg-ok-track font-medium"
              : "border-line bg-surface text-ink"
          }`}
        >
          <option value={UNSORTED}>Choose a category…</option>
          <option value={NO_CATEGORY}>No category (income or transfer)</option>
          {archivedIsCurrent && <option value={categoryId}>{categoryName} (archived)</option>}
          {listDrawn
            ? groups.map((group) => (
                <optgroup key={group.name} label={group.name}>
                  {group.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              ))
            : shownIsCategory &&
              !(archivedIsCurrent && shown === String(categoryId)) && (
                <option value={shown}>{nameOf(shown)}</option>
              )}
        </select>
      </span>
      <ErrorText error={error} as="span" className="mt-1 text-xs" />
    </span>
  );
}
