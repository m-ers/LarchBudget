"use client";

import { copyLastMonthAction } from "@/app/actions";
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
 */
export function CopyLastMonth() {
  const { month, locale } = useBudget();
  const { error, pending, save } = useSave();

  return (
    <p className="mx-3.5 mt-2.5 mb-1 text-sm text-muted">
      Nothing assigned in {monthName(month, locale)} yet.{" "}
      <button
        type="button"
        disabled={pending}
        onClick={() => save(() => copyLastMonthAction(month))}
        className="rounded-md px-1.5 py-0.5 font-medium text-brand transition-colors hover:bg-hover disabled:opacity-60"
      >
        {pending ? "Assigning…" : `Assign the same as ${monthName(addMonths(month, -1), locale)}`}
      </button>
      <ErrorText error={error} as="span" className="ml-2" />
    </p>
  );
}
