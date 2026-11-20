"use client";

import { useId, useState } from "react";
import { restoreCategoryAction } from "@/app/actions";
import type { ArchivedCategory } from "@/db/budget";
import { formatMoney } from "@/lib/money";
import { ErrorText } from "../form";
import { useSave } from "../use-save";
import { useBudget } from "./budget-context";

const textButton =
  "rounded-md px-1.5 py-0.5 font-medium text-brand transition-colors hover:bg-hover";

/**
 * The quiet line under the budget table that says how many categories are
 * archived. "Show" lists them, each with "Restore".
 */
export function ArchivedCategories({ categories }: { categories: ArchivedCategory[] }) {
  const [shown, setShown] = useState(false);
  const listId = useId();
  const count = categories.length;

  return (
    <div className="mt-2 px-3.5 pb-1 text-sm text-muted">
      <p>
        {count === 1 ? "1 archived category" : `${count} archived categories`} ·{" "}
        {/* Pulled back by its padding, so the dot sits halfway. */}
        <button
          type="button"
          aria-expanded={shown}
          aria-controls={listId}
          onClick={() => setShown(!shown)}
          className={`${textButton} -ml-1.5`}
        >
          {shown ? "Hide" : "Show"}
        </button>
      </p>
      {shown && (
        <ul id={listId} aria-label="Archived categories" className="mt-1">
          {categories.map((category) => (
            <ArchivedRow key={category.id} category={category} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One archived category: its name, what it holds, and what restoring it does. */
function ArchivedRow({ category: { id, name, balance } }: { category: ArchivedCategory }) {
  const { currency, locale } = useBudget();
  const { error, pending, save } = useSave();
  const money = formatMoney(Math.abs(balance), currency, locale);
  // Its balance counts in the budget again, so Ready to assign moves the other way.
  const effect =
    balance > 0
      ? `Restoring takes ${money} out of Ready to assign.`
      : balance < 0
        ? `Restoring adds ${money} to Ready to assign.`
        : null;

  return (
    <li className={`flex min-h-8 items-center gap-4 ${pending ? "opacity-60" : ""}`}>
      <span className="w-48 truncate font-medium text-ink">{name}</span>
      <span className="w-24 text-right text-ink tabular-nums">
        {formatMoney(balance, currency, locale)}
      </span>
      <button
        type="button"
        onClick={() => save(() => restoreCategoryAction(id))}
        aria-label={`Restore ${name}`}
        className={textButton}
      >
        Restore
      </button>
      {error ? <ErrorText error={error} as="span" /> : effect}
    </li>
  );
}
