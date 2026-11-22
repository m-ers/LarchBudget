"use client";

import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";
import { useDateLocale, useT } from "@/i18n/client";
import type { Translate } from "@/i18n/translate";
import { addMonths, monthName } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { readyLines, type ReadyBreakdown, type ReadyLine } from "@/lib/ready";
import { focusLeft, placePopup, popupCard } from "../menu";
import { useBudget } from "./budget-context";

/**
 * Whether the card that shows how Ready to assign adds up is open. Held by
 * the budget page: the big figure is its button, inside the page header,
 * and the card opens under the header, outside it.
 */
export function useReadyBreakdown() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  return { open, setOpen, button, id };
}

type State = ReturnType<typeof useReadyBreakdown>;

/**
 * What makes the big figure the card's button, named for screen readers
 * with what it shows: "Ready to assign: €2,857.65, show how it adds up".
 */
export function readyBreakdownButton({ open, setOpen, button, id }: State, name: string) {
  return {
    ref: button,
    "aria-label": name,
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
    // The focus stays in the open card, so a second click closes it
    // instead of opening it again.
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => setOpen(!open),
  } as const;
}

/** The text of a line, e.g. "Left over from October". */
function lineLabel(
  t: Translate,
  part: ReadyLine["part"],
  breakdown: ReadyBreakdown,
  name: (delta: number) => string,
): string {
  switch (part) {
    case "leftOver":
      return t("budget.breakdown.leftOver", { month: name(-1) });
    case "received":
      return t("budget.breakdown.received", { month: name(0) });
    case "withoutCategory":
      return t("budget.breakdown.withoutCategory", { month: name(0) });
    case "assigned":
      return t("budget.breakdown.assigned", { month: name(0) });
    case "assignedLater":
      return t("budget.breakdown.assignedLater");
    case "alreadyIn":
      return breakdown.beyondNextMonth
        ? t("budget.breakdown.alreadyInLater")
        : t("budget.breakdown.alreadyIn", { month: name(1) });
  }
}

// The amounts form a column: the sign at its left edge, the amount at its right.
const amountCell = "flex justify-between gap-3 pl-10 whitespace-nowrap tabular-nums";
const totalRow = "mt-1.5 border-t border-line pt-2 font-semibold";

/**
 * How Ready to assign adds up for the month on screen, as a written sum
 * whose lines add up to the big figure exactly (see `ReadyBreakdown`). It
 * reads the same figures as the rest of the page, so a new amount shows in
 * it at once.
 *
 * It takes the focus when it opens. Escape closes it and goes back to the
 * figure; so does clicking elsewhere or tabbing on, which moves the focus
 * past it.
 */
export function ReadyBreakdownCard({ state }: { state: State }) {
  const t = useT();
  const dateLocale = useDateLocale();
  const { month, currency, locale, figures } = useBudget();
  const card = useRef<HTMLDivElement>(null);

  // Place the card before it is first painted, then hand it the focus.
  useLayoutEffect(() => {
    if (!card.current) return;
    placePopup(card.current, { align: "end" });
    card.current.focus();
  }, []);

  const breakdown = figures.readyBreakdown;
  const name = (delta: number) => monthName(addMonths(month, delta), dateLocale);
  const money = (amount: number) => formatMoney(amount, currency, locale);

  return (
    <div
      ref={card}
      id={state.id}
      role="dialog"
      aria-label={t("budget.breakdown.title")}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        state.setOpen(false);
        state.button.current?.focus();
      }}
      onBlur={(e) => {
        if (focusLeft(e)) state.setOpen(false);
      }}
      className={`${popupCard} w-max min-w-72 px-4 py-2.5 text-sm text-ink`}
    >
      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5">
        {readyLines(breakdown).map((line) => (
          <Fragment key={line.part}>
            <dt className="whitespace-nowrap">{lineLabel(t, line.part, breakdown, name)}</dt>
            <dd className={amountCell}>
              <span className="text-muted">{line.amount < 0 ? "−" : "+"}</span>{" "}
              <span>{money(Math.abs(line.amount))}</span>
            </dd>
          </Fragment>
        ))}
        <dt className={totalRow}>{t("budget.ready.readyToAssign")}</dt>
        <dd className={`${amountCell} ${totalRow}`}>
          <span className="text-muted">=</span>{" "}
          <span className={figures.readyToAssign < 0 ? "text-bad" : ""}>
            {money(figures.readyToAssign)}
          </span>
        </dd>
      </dl>
    </div>
  );
}
