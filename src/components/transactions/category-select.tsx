"use client";

import { useRef, useState } from "react";
import { sortTransactionAction } from "@/app/actions";
import type { CategoryOptionGroup, SortTarget } from "@/db/transactions";
import { ErrorText } from "../form";
import { useSave } from "../use-save";

type Props = {
  transactionId: number;
  /** What the transaction is about, for screen readers. */
  describedAs: string;
  categoryId: number | null;
  /** The category's name; needed when it is archived and so not in `groups`. */
  categoryName: string | null;
  categoryArchived: boolean;
  toSort: boolean;
  groups: CategoryOptionGroup[];
};

const UNSORTED = "unsorted";
const NO_CATEGORY = "ready";

/**
 * Chooses where a transaction belongs.
 *
 * A choice made with the mouse is saved at once. With the keyboard, arrow
 * keys and typing only browse the list (a closed dropdown reports every one
 * of those as a change); the choice is saved on Enter or when leaving the
 * field, and Escape puts the old value back. After a save by mouse or Enter,
 * focus moves to the next transaction so a list can be worked through.
 */
export function CategorySelect({
  transactionId,
  describedAs,
  categoryId,
  categoryName,
  categoryArchived,
  toSort,
  groups,
}: Props) {
  const select = useRef<HTMLSelectElement>(null);
  const browsingByKeyboard = useRef(false);
  // A value picked with the keyboard that is not saved yet.
  const [draft, setDraft] = useState<string | null>(null);
  const { error, setError, pending, save: run } = useSave();

  const saved = toSort ? UNSORTED : categoryId === null ? NO_CATEGORY : String(categoryId);
  const shown = draft ?? saved;

  function save(next: string, thenFocusNext: boolean) {
    if (pending) return;
    if (next === saved) {
      setDraft(null);
      return;
    }
    const target: SortTarget = next === UNSORTED || next === NO_CATEGORY ? next : Number(next);

    // Find the next transaction now: this row may leave the list once sorted.
    const table = select.current?.closest("table");
    const all = Array.from(table?.querySelectorAll<HTMLSelectElement>("select[data-tx]") ?? []);
    const nextId = all[all.indexOf(select.current!) + 1]?.dataset.tx;

    setDraft(next);
    run(
      () => sortTransactionAction(transactionId, target),
      () => {
        setDraft(null);
        if (thenFocusNext && nextId) {
          requestAnimationFrame(() =>
            table?.querySelector<HTMLSelectElement>(`select[data-tx="${nextId}"]`)?.focus(),
          );
        }
      },
    );
  }

  return (
    <span className="flex flex-col">
      <select
        ref={select}
        data-tx={transactionId}
        aria-label={`Category for ${describedAs}`}
        aria-invalid={error ? true : undefined}
        aria-busy={pending || undefined}
        value={shown}
        onPointerDown={() => (browsingByKeyboard.current = false)}
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
        onBlur={() => {
          browsingByKeyboard.current = false;
          if (draft !== null) save(draft, false);
        }}
        className={`w-56 rounded-[9px] border px-2.5 py-1.5 text-[14.5px] focus:border-brand focus:outline-none ${
          shown === UNSORTED
            ? "border-brand/50 bg-ok-track font-medium"
            : "border-line bg-surface text-ink"
        } ${pending ? "opacity-60" : ""}`}
      >
        <option value={UNSORTED}>Choose a category…</option>
        <option value={NO_CATEGORY}>No category (income or transfer)</option>
        {categoryArchived && categoryId !== null && (
          <option value={categoryId}>{categoryName} (archived)</option>
        )}
        {groups.map((group) => (
          <optgroup key={group.name} label={group.name}>
            {group.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ErrorText error={error} as="span" className="mt-1 text-xs" />
    </span>
  );
}
