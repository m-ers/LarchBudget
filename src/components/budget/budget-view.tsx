"use client";

import Link from "next/link";
import { useOptimistic } from "react";
import type { BudgetMonth } from "@/db/budget";
import type { Month } from "@/lib/dates";
import { formatMoneyParts, formatMoneyRounded } from "@/lib/money";
import { primaryButton } from "../form";
import { Hero, HeroFigure, HeroLead } from "../hero";
import { applyChange } from "./budget-changes";
import { BudgetContext } from "./budget-context";
import { GroupBody } from "./group-body";
import { NewGroup } from "./new-group";

type Props = {
  /** The month as the server worked it out. */
  budget: BudgetMonth;
  month: Month;
  currency: string;
  locale: string;
  /** Days left in the month, or null when it is not the current month. */
  daysLeft: number | null;
  /** The month's title and the links to other months. */
  monthNav: React.ReactNode;
};

/** What the headline says about the money that is not in a category yet. */
function readyHeadline(ready: number, hasAccounts: boolean) {
  if (ready < 0) return { label: "Assigned more than you have", tone: "alert" } as const;
  if (ready > 0) return { label: "Ready to assign", tone: "normal" } as const;
  return hasAccounts
    ? ({ label: "Every cent is assigned", tone: "done" } as const)
    : ({ label: "Ready to assign", tone: "quiet" } as const);
}

// Every heading cell sticks, on a background so rows do not show through.
// Its bottom line is drawn inside the cell, as a row's border would not
// move along.
const stuck = "sticky top-0 z-10 bg-surface shadow-[inset_0_-1px_0_var(--line)]";

/** The column headings. They stay in view while the page scrolls. */
function TableHead() {
  return (
    <thead>
      <tr className="text-[12.5px] text-muted">
        <th scope="col" className={`h-[38px] w-[54px] ${stuck}`}>
          <span className="sr-only">Group colour</span>
        </th>
        <th scope="col" className={`text-left font-medium ${stuck}`}>
          Category
        </th>
        <th scope="col" className={`w-32 text-right font-medium ${stuck}`}>
          Assigned
        </th>
        <th scope="col" className={`w-32 text-right font-medium ${stuck}`}>
          Spent
        </th>
        <th scope="col" className={`w-40 pr-6 text-right font-medium ${stuck}`}>
          Available
        </th>
      </tr>
    </thead>
  );
}

/**
 * The budget page for one month: the header with Ready to assign, and the
 * table of groups and categories.
 *
 * It shows the server's figures with every change that is still being saved
 * applied on top (see `budget-changes.ts`), so a change and everything it
 * moves show at once. Parts below reach the month, the formatting and `show`
 * through `useBudget`.
 */
export function BudgetView({ budget: saved, month, currency, locale, daysLeft, monthNav }: Props) {
  const [budget, show] = useOptimistic(saved, applyChange);
  const { spent, assigned } = budget.totals;
  const ready = budget.readyToAssign;

  return (
    <BudgetContext value={{ month, currency, locale, show }}>
      <Hero>
        <div className="relative">
          {monthNav}
          {(spent > 0 || assigned !== 0) && (
            <HeroLead>
              <b className="font-semibold text-white">
                {formatMoneyRounded(spent, currency, locale)}
              </b>{" "}
              spent of {formatMoneyRounded(assigned, currency, locale)} assigned
              {daysLeft !== null && (
                <>
                  {" · "}
                  <b className="font-semibold text-white">
                    {daysLeft} {daysLeft === 1 ? "day" : "days"}
                  </b>{" "}
                  to go
                </>
              )}
            </HeroLead>
          )}
        </div>
        <HeroFigure
          amount={formatMoneyParts(ready, currency, locale)}
          {...readyHeadline(ready, budget.hasAccounts)}
        />
      </Hero>

      <section className="flex-1 rounded-2xl border border-line bg-surface px-2.5 pt-1.5 pb-2.5">
        {!budget.hasAccounts && (
          <div className="mx-3.5 mt-3 mb-2 flex items-center justify-between gap-6 rounded-xl bg-ok-track px-5 py-4">
            <p className="max-w-xl">
              <span className="font-semibold">Welcome to LarchBudget.</span> Start by adding the
              accounts your money is in. Their balance becomes your money to assign, and then you
              divide it over categories.
            </p>
            <Link href="/accounts" className={`${primaryButton} shrink-0 px-3.5 py-2`}>
              Add an account
            </Link>
          </div>
        )}

        <table className="w-full border-collapse">
          <TableHead />
          {budget.groups.map((group) => (
            <GroupBody key={group.id ?? "ungrouped"} group={group} />
          ))}
        </table>

        {budget.groups.length === 0 && (
          <p className="max-w-2xl px-3.5 pt-5 pb-2 text-muted">
            No categories yet. A category is a purpose you set money aside for, such as Rent,
            Groceries or Holiday. Categories live in groups, so start by naming your first group,
            for example Fixed costs.
          </p>
        )}

        <div className="mt-3">
          <NewGroup
            placeholder={budget.groups.length === 0 ? "Name your first group" : "New group"}
          />
        </div>
      </section>
    </BudgetContext>
  );
}
