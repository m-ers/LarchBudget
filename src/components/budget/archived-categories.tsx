"use client";

import { useId, useState } from "react";
import { restoreCategoryAction } from "@/app/actions";
import type { ArchivedCategory } from "@/db/budget";
import { useT } from "@/i18n/client";
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
  const t = useT();

  return (
    <div className="mt-2 px-3.5 pb-1 text-sm text-muted">
      <p>
        {t("budget.archived.count", { count })} ·{" "}
        {/* Pulled back by its padding, so the dot sits halfway. */}
        <button
          type="button"
          aria-expanded={shown}
          aria-controls={listId}
          onClick={() => setShown(!shown)}
          className={`${textButton} -ml-1.5`}
        >
          {shown ? t("budget.archived.hide") : t("budget.archived.show")}
        </button>
      </p>
      {shown && (
        <ul id={listId} aria-label={t("budget.archived.listLabel")} className="mt-1">
          {categories.map((category) => (
            <ArchivedRow key={category.id} category={category} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One archived category: its name, what it holds, and what restoring it
 * does. An income category holds nothing, so it says it is income instead.
 */
function ArchivedRow({ category: { id, name, balance, income } }: { category: ArchivedCategory }) {
  const { currency, locale } = useBudget();
  const { error, pending, save } = useSave();
  const t = useT();
  const money = formatMoney(Math.abs(balance), currency, locale);
  // Its balance counts in the budget again, so Ready to assign moves the other way.
  const effect =
    balance > 0
      ? t("budget.archived.restoringTakes", { amount: money })
      : balance < 0
        ? t("budget.archived.restoringAdds", { amount: money })
        : null;

  return (
    <li className={`flex min-h-8 items-center gap-4 ${pending ? "opacity-60" : ""}`}>
      <span className="w-48 truncate font-medium text-ink">{name}</span>
      {income ? (
        <span className="w-24 text-right">{t("budget.archived.income")}</span>
      ) : (
        <span className="w-24 text-right text-ink tabular-nums">
          {formatMoney(balance, currency, locale)}
        </span>
      )}
      <button
        type="button"
        onClick={() => save(() => restoreCategoryAction(id))}
        aria-label={t("budget.archived.restoreLabel", { name })}
        className={textButton}
      >
        {t("budget.archived.restore")}
      </button>
      {error ? <ErrorText error={error} as="span" /> : effect}
    </li>
  );
}
