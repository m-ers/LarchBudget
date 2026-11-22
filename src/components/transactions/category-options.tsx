"use client";

import { useContext } from "react";
import { useT } from "@/i18n/client";
import { CategoryChoices } from "./category-choices";

/** The value of the option for no category, on purpose: a transfer, or income without a category. */
export const NO_CATEGORY = "ready";

/**
 * The options of a category dropdown: "no category" first, then the
 * categories in their groups, the income categories on top. `archived` holds
 * archived categories that may stay chosen, by id and name.
 */
export function CategoryOptions({ archived }: { archived?: Map<number, string> }) {
  const t = useT();
  const groups = useContext(CategoryChoices);
  const hasIncome = groups.some((group) => group.id === "income");
  return (
    <>
      <option value={NO_CATEGORY}>
        {hasIncome
          ? t("transactions.picker.noCategoryTransfer")
          : t("transactions.picker.noCategoryIncomeOrTransfer")}
      </option>
      {[...(archived ?? [])].map(([id, name]) => (
        <option key={id} value={id}>
          {t("transactions.picker.archived", { name })}
        </option>
      ))}
      {groups.map((group) => (
        <optgroup key={String(group.id)} label={group.name}>
          {group.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
