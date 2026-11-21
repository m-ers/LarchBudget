"use client";

import { useContext, useRef, useState } from "react";
import { sortTransactionAction } from "@/app/actions";
import type { SortTarget, Suggestion } from "@/db/transactions";
import { ErrorText } from "../form";
import { CheckIcon } from "../icons";
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
/** What the field holds while it shows a suggestion: nothing is chosen yet. */
const SUGGESTED = "suggested";

/**
 * Chooses where a transaction belongs.
 *
 * A choice made with the mouse is saved at once. With the keyboard, arrow
 * keys and typing only browse the list (a closed dropdown reports every one
 * of those as a change); the choice is saved on Enter or when leaving the
 * field, and Escape puts the old value back. A choice is shown at once and
 * focus moves to the next transaction without waiting for the server, so a
 * list can be worked through quickly.
 *
 * A suggestion from last time is shown in the field itself, in the look of a
 * field still to fill in. Nothing is saved until it is accepted, with the
 * check mark next to it or with Enter.
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
  // A suggestion is shown until something is picked.
  const suggested = toSort && draft === null ? suggestion : undefined;
  const suggestedValue = suggested
    ? suggested.categoryId === null
      ? NO_CATEGORY
      : String(suggested.categoryId)
    : null;
  const suggestedName = suggested?.category ?? "No category";
  const shown = draft ?? (suggested ? SUGGESTED : saved);

  function focusNextRow() {
    // This row may leave the list once saved.
    let row = cell.current?.closest("tr")?.nextElementSibling;
    while (row) {
      const control = row.querySelector<HTMLElement>("[data-sort-control]");
      if (control) return control.focus();
      row = row.nextElementSibling;
    }
  }

  function save(choice: string, thenFocusNext: boolean) {
    // Accepting a suggestion is choosing what it stands for.
    const next = choice === SUGGESTED ? suggestedValue : choice;
    if (saving.current || next === null) return;
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

  const shownIsCategory = shown !== UNSORTED && shown !== NO_CATEGORY && shown !== SUGGESTED;
  // Once there are income categories, "No category" is mostly for transfers between own accounts.
  const hasIncome = groups.some((group) => group.id === "income");
  const noCategory = hasIncome ? "No category (transfer)" : "No category (income or transfer)";
  const archivedIsCurrent = categoryArchived && categoryId !== null;

  return (
    <span ref={cell} className="flex flex-col">
      <span className="flex items-center gap-1.5">
        <select
          data-sort-control
          aria-label={`Category for ${describedAs}, ${amount}`}
          aria-invalid={error ? true : undefined}
          title={
            suggested
              ? `Suggested: you chose ${suggestedName} for this payee last time. Not sorted yet.`
              : undefined
          }
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
          className={`w-48 rounded-[9px] border px-2.5 py-1.5 text-[14.5px] xl:w-64 focus:border-brand focus:outline-none ${
            shown === UNSORTED || shown === SUGGESTED
              ? "border-brand/50 bg-ok-track font-medium"
              : "border-line bg-surface text-ink"
          }`}
        >
          {suggested && (
            // Shown in the field but left out of the list: there the category
            // itself is picked, like any other, and that is a choice.
            <option value={SUGGESTED} hidden>
              {suggested.categoryId === null ? noCategory : suggested.category}
            </option>
          )}
          <option value={UNSORTED}>Choose a category…</option>
          <option value={NO_CATEGORY}>{noCategory}</option>
          {archivedIsCurrent && <option value={categoryId}>{categoryName} (archived)</option>}
          {listDrawn
            ? groups.map((group) => (
                <optgroup key={String(group.id)} label={group.name}>
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
        {suggested && (
          <button
            type="button"
            aria-label={`Sort ${describedAs} into ${suggestedName}, as last time`}
            title={`Sort into ${suggestedName}, as last time`}
            onClick={() => save(SUGGESTED, true)}
            className="grid size-[34px] shrink-0 place-items-center rounded-[9px] border border-brand/50 text-brand transition-colors hover:bg-ok-track focus-visible:border-brand focus-visible:outline-none"
          >
            <CheckIcon />
          </button>
        )}
      </span>
      <ErrorText error={error} as="span" className="mt-1 text-xs" />
    </span>
  );
}
