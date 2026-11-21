"use client";

import { copyLastMonthAction } from "@/app/actions";
import { useDateLocale, useT } from "@/i18n/client";
import { addMonths, monthLabelParts, type Month } from "@/lib/dates";
import { ErrorText } from "../form";
import { useSave } from "../use-save";
import { useBudget } from "./budget-context";

/** "December", without the year. */
const monthName = (month: Month, locale: string) =>
  monthLabelParts(month, locale).find((part) => part.type === "month")?.value;

/**
 * The quiet line above the groups of a month that has nothing assigned
 * yet, while the month before it has: one click assigns the same again.
 * While targets need money, `AssignTargets` takes its place.
 */
export function CopyLastMonth() {
  const { month, announce, focusTitle } = useBudget();
  const locale = useDateLocale();
  const { error, pending, save } = useSave();
  const t = useT();
  const lastMonth = monthName(addMonths(month, -1), locale) ?? "";

  return (
    <p className="mx-3.5 mt-2.5 mb-1 text-sm text-muted">
      {t("budget.copyLastMonth.nothing", { month: monthName(month, locale) ?? "" })}{" "}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          announce("");
          save(
            () => copyLastMonthAction(month),
            () => {
              // The line goes now, and the focus would fall back to the
              // start of the page with it.
              focusTitle();
              announce(t("budget.copyLastMonth.done", { month: lastMonth }));
            },
          );
        }}
        className="rounded-md px-1.5 py-0.5 font-medium text-brand transition-colors hover:bg-hover disabled:opacity-60"
      >
        {pending
          ? t("budget.copyLastMonth.assigning")
          : t("budget.copyLastMonth.assign", { month: lastMonth })}
      </button>
      <ErrorText error={error} as="span" className="ml-2" />
    </p>
  );
}
