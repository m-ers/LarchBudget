"use client";

import { useT } from "@/i18n/client";

// Every heading cell sticks, on a background so rows do not show through.
// Its bottom line is drawn inside the cell, as a row's border would not
// move along.
const stuck = "sticky top-0 z-10 bg-surface shadow-[inset_0_-1px_0_var(--line)]";

/**
 * The column headings. They stay in view while the page scrolls, and once
 * the page header is out of view they also show what is left to assign,
 * in place of the word "Category".
 */
export function TableHead({
  ready,
}: {
  /** What is left to assign, as the page header says it; null while that is in view. */
  ready: { label: string; alert: boolean; amount: string } | null;
}) {
  const t = useT();
  return (
    <thead>
      <tr className="text-[12.5px] text-muted">
        <th scope="col" className={`h-[38px] w-[54px] ${stuck}`}>
          <span className="sr-only">{t("budget.table.groupColour")}</span>
        </th>
        <th scope="col" className={`text-left font-medium ${stuck}`}>
          {ready ? (
            <>
              <span className="sr-only">{t("budget.table.category")}</span>
              {/* Screen readers have the page header's figure already. */}
              <span aria-hidden="true" data-testid="table-head-ready">
                {ready.label}{" "}
                <b
                  className={`text-sm font-semibold tabular-nums ${ready.alert ? "text-bad" : "text-ink"}`}
                >
                  {ready.amount}
                </b>
              </span>
            </>
          ) : (
            t("budget.table.category")
          )}
        </th>
        <th scope="col" className={`w-32 text-right font-medium ${stuck}`}>
          {t("budget.table.assigned")}
        </th>
        <th scope="col" className={`w-32 text-right font-medium ${stuck}`}>
          {t("budget.table.spent")}
        </th>
        <th scope="col" className={`w-40 pr-6 text-right font-medium ${stuck}`}>
          {t("budget.table.available")}
        </th>
      </tr>
    </thead>
  );
}
