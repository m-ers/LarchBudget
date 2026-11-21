"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState } from "react";
import type { ArchivedCategory, BudgetMonth, GroupRow } from "@/db/budget";
import type { Month } from "@/lib/dates";
import { formatMoney, formatMoneyParts, formatMoneyRounded } from "@/lib/money";
import { primaryButton } from "../form";
import { Hero, HeroFigure, HeroLead } from "../hero";
import { ArchivedCategories } from "./archived-categories";
import { applyChange } from "./budget-changes";
import { BudgetContext } from "./budget-context";
import { CopyLastMonth } from "./copy-last-month";
import { GroupBody, UngroupedBody } from "./group-body";
import { IncomeBody } from "./income-body";
import { NewGroup } from "./new-group";
import { TableHead } from "./table-head";

type Props = {
  /** The month as the server worked it out. */
  budget: BudgetMonth;
  /** Archived categories, which can be restored from under the table. */
  archived: ArchivedCategory[];
  month: Month;
  currency: string;
  locale: string;
  /** Days left in the month, or null when it is not the current month. */
  daysLeft: number | null;
  /** The month's title and the links to other months. */
  monthNav: React.ReactNode;
};

/** True for a group, false for the section of categories without one. */
const isGroup = (group: GroupRow): group is GroupRow & { id: number } => group.id !== null;

/** What the headline says about the money that is not in a category yet. */
function readyHeadline(ready: number, hasAccounts: boolean) {
  if (ready < 0) return { label: "Assigned more than you have", tone: "alert" } as const;
  if (ready > 0) return { label: "Ready to assign", tone: "normal" } as const;
  return hasAccounts
    ? ({ label: "Every cent is assigned", tone: "done" } as const)
    : ({ label: "Ready to assign", tone: "quiet" } as const);
}

/** Whether an element is at least partly in the window. True until known, as on the first paint. */
function useInView(ref: React.RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

/**
 * The budget page for one month: the header with Ready to assign, and the
 * table of income, groups and categories.
 *
 * It shows the server's figures with every change that is still being saved
 * applied on top (see `budget-changes.ts`), so a change and everything it
 * moves show at once. Parts below reach the month, the formatting and `show`
 * through `useBudget`.
 */
export function BudgetView({
  budget: saved,
  archived,
  month,
  currency,
  locale,
  daysLeft,
  monthNav,
}: Props) {
  const [budget, show] = useOptimistic(saved, applyChange);
  const { spent, assigned } = budget.totals;
  const { received } = budget.income;
  const showSpent = spent > 0 || assigned !== 0;
  const ready = budget.readyToAssign;
  const headline = readyHeadline(ready, budget.hasAccounts);
  const hero = useRef<HTMLElement>(null);
  const heroInView = useInView(hero);
  const groupCount = budget.groups.filter(isGroup).length;

  return (
    <BudgetContext value={{ month, currency, locale, figures: budget, show }}>
      <Hero ref={hero}>
        <div className="relative">
          {monthNav}
          {(received !== 0 || showSpent) && (
            <HeroLead>
              {received !== 0 && (
                <>
                  <b className="font-semibold text-white">
                    {formatMoneyRounded(received, currency, locale)}
                  </b>{" "}
                  received
                </>
              )}
              {received !== 0 && showSpent && " · "}
              {showSpent && (
                <>
                  <b className="font-semibold text-white">
                    {formatMoneyRounded(spent, currency, locale)}
                  </b>{" "}
                  spent of {formatMoneyRounded(assigned, currency, locale)} assigned
                </>
              )}
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
        {/* How the figure adds up, on hover. */}
        <div
          title={
            budget.inCategories < 0
              ? `${formatMoney(budget.inAccounts, currency, locale)} in your accounts + ${formatMoney(-budget.inCategories, currency, locale)} overspent in categories`
              : `${formatMoney(budget.inAccounts, currency, locale)} in your accounts − ${formatMoney(budget.inCategories, currency, locale)} in categories`
          }
        >
          <HeroFigure amount={formatMoneyParts(ready, currency, locale)} {...headline} />
        </div>
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

        {budget.assignedLastMonth &&
          budget.groups.every((g) => g.categories.every((c) => c.assigned === 0)) && (
            <CopyLastMonth />
          )}

        <table className="w-full border-collapse">
          <TableHead
            ready={
              heroInView
                ? null
                : {
                    label: headline.label,
                    alert: headline.tone === "alert",
                    amount: formatMoney(ready, currency, locale),
                  }
            }
          />
          <IncomeBody income={budget.income} />
          {budget.groups.map((group, i) =>
            isGroup(group) ? (
              <GroupBody
                key={group.id}
                group={group}
                first={i === 0}
                // Expense categories without a group come after every group.
                last={i === groupCount - 1}
              />
            ) : (
              <UngroupedBody key="ungrouped" group={group} />
            ),
          )}
        </table>

        {budget.groups.length === 0 && (
          <p className="max-w-2xl px-3.5 pt-5 pb-2 text-muted">
            {budget.income.categories.length === 0 && "No categories yet. "}A category is a purpose
            you set money aside for, such as Rent, Groceries or Holiday. Categories live in groups,
            so start by naming your first group, for example Fixed costs.
          </p>
        )}

        <div className="mt-3">
          <NewGroup
            placeholder={budget.groups.length === 0 ? "Name your first group" : "New group"}
          />
        </div>

        {archived.length > 0 && <ArchivedCategories categories={archived} />}
      </section>
    </BudgetContext>
  );
}
