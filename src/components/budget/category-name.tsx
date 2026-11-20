"use client";

import { archiveCategoryAction, renameCategoryAction } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { ErrorText } from "../form";
import { ArchiveIcon } from "../icons";
import { InlineName } from "../inline-name";
import { useSave } from "../use-save";
import { useBudget } from "./budget-context";
import { RowAction } from "./row-action";

type Props = {
  id: number;
  name: string;
  /** What the category holds over all time: what archiving gives back. */
  balance: number;
};

/**
 * Category name: click to rename. The category's actions sit beside it and
 * show on row hover; for now that is archiving.
 */
export function CategoryName({ id, name, balance }: Props) {
  const { currency, locale } = useBudget();
  const { error, pending, save } = useSave();

  function archive() {
    const question = `Archive "${name}"?`;
    const money = formatMoney(Math.abs(balance), currency, locale);
    const message =
      balance > 0
        ? `${question} Its ${money} goes back to Ready to assign.`
        : balance < 0
          ? `${question} It is overspent by ${money}, which then comes out of Ready to assign.`
          : question;
    if (window.confirm(message)) save(() => archiveCategoryAction(id));
  }

  return (
    <div className={`flex min-w-0 items-center gap-1 ${pending ? "opacity-60" : ""}`}>
      <InlineName
        value={name}
        label="Category name"
        onSave={(text) => renameCategoryAction(id, text)}
        className="text-[15.5px] font-medium"
      />
      <RowAction label={`Archive ${name}`} title="Archive" onClick={archive} revealOn="row">
        <ArchiveIcon width={15} height={15} />
      </RowAction>
      <ErrorText error={error} as="span" className="text-xs" />
    </div>
  );
}
