"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState } from "react";
import type { ArchivedCategory, BudgetMonth, GroupRow } from "@/db/budget";
import { useT } from "@/i18n/client";
import { richText } from "@/i18n/rich";
import type { Translate } from "@/i18n/translate";
import type { Month } from "@/lib/dates";
import { formatMoney, formatMoneyParts } from "@/lib/money";
import { ErrorText, primaryButton } from "../form";
import { Hero, HeroFigure } from "../hero";
import { useSave } from "../use-save";
import { ArchivedCategories } from "./archived-categories";
import { AssignTargets } from "./assign-targets";
import { applyChange } from "./budget-changes";
import { BudgetContext } from "./budget-context";
import { CopyLastMonth } from "./copy-last-month";
import { GroupBody, UngroupedBody } from "./group-body";
import { IncomeBody } from "./income-body";
import { NewGroup } from "./new-group";
import { ReadyBreakdownCard, readyBreakdownButton, useReadyBreakdown } from "./ready-breakdown";
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
  /** The month's title, an `h1` that can take the focus, and the links to other months. */
  monthNav: React.ReactNode;
};

const bold = (chunks: React.ReactNode) => <b className="font-semibold text-white">{chunks}</b>;

/** True for a group, false for the section of categories without one. */
const isGroup = (group: GroupRow): group is GroupRow & { id: number } => group.id !== null;

/** What the headline says about the money that is not in a category yet. */
function readyHeadline(t: Translate, ready: number, hasAccounts: boolean) {
  if (ready < 0) return { label: t("budget.ready.assignedMore"), tone: "alert" } as const;
  if (ready > 0) return { label: t("budget.ready.readyToAssign"), tone: "normal" } as const;
  return hasAccounts
    ? ({ label: t("budget.ready.allAssigned"), tone: "done" } as const)
    : ({ label: t("budget.ready.readyToAssign"), tone: "quiet" } as const);
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
 * The budget page for one month: the header with the month and Ready to
 * assign, which opens how it adds up; and the table of income, groups and
 * categories.
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
  const t = useT();
  const [budget, show] = useOptimistic(saved, applyChange);
  const ready = budget.readyToAssign;
  const headline = readyHeadline(t, ready, budget.hasAccounts);
  const breakdown = useReadyBreakdown();
  const hero = useRef<HTMLElement>(null);
  const heroInView = useInView(hero);
  const groupCount = budget.groups.filter(isGroup).length;
  // Assigning the targets; kept here, as its button goes once they are met.
  const assigningTargets = useSave();
  // What the last change said in the status line (see `announce`).
  const [status, setStatus] = useState("");

  function focusTitle() {
    hero.current?.querySelector<HTMLElement>("h1")?.focus();
  }

  return (
    <BudgetContext
      value={{ month, currency, locale, figures: budget, show, announce: setStatus, focusTitle }}
    >
      {/* The card that shows how Ready to assign adds up opens under the
          header, lined up with its right edge: the header clips what
          sticks out of it. */}
      <div className="relative shrink-0">
        <Hero ref={hero}>
          <div className="relative">
            {/* As high as the arrows, so "This month" does not move the title. */}
            <div className="flex h-7 items-center gap-x-4">
              {monthNav}
              {daysLeft !== null && (
                <p className="text-[14.5px] whitespace-nowrap text-white/70">
                  {richText(t, "budget.header.daysToGo", { count: daysLeft }, { b: bold })}
                </p>
              )}
            </div>
            {/* On its own under the month, while targets need money. It goes
                once its work is done, and gives the focus to the month's
                title first. */}
            {budget.needed > 0 && <AssignTargets state={assigningTargets} />}
          </div>
          <HeroFigure
            amount={formatMoneyParts(ready, currency, locale)}
            {...headline}
            button={
              budget.hasAccounts
                ? readyBreakdownButton(
                    breakdown,
                    t("budget.breakdown.button", {
                      label: headline.label,
                      amount: formatMoney(ready, currency, locale),
                    }),
                  )
                : undefined
            }
          />
        </Hero>
        {breakdown.open && <ReadyBreakdownCard state={breakdown} />}
      </div>

      <section className="flex-1 rounded-2xl border border-line bg-surface px-2.5 pt-1.5 pb-2.5">
        {!budget.hasAccounts && (
          <div className="mx-3.5 mt-3 mb-2 flex items-center justify-between gap-6 rounded-xl bg-ok-track px-5 py-4">
            <p className="max-w-xl">
              {richText(
                t,
                "budget.welcome.text",
                {},
                { b: (chunks) => <span className="font-semibold">{chunks}</span> },
              )}
            </p>
            <Link href="/accounts" className={`${primaryButton} shrink-0 px-3.5 py-2`}>
              {t("budget.welcome.addAccount")}
            </Link>
          </div>
        )}

        <p role="status" className="sr-only">
          {status}
        </p>

        {/* While targets need money, the header offers to assign them, and
            why that failed shows here; assigning the same as last month
            waits until they need nothing. That line goes once its button
            has done its work, and gives the focus to the month's title. */}
        {budget.needed > 0 ? (
          <ErrorText error={assigningTargets.error} className="mx-3.5 mt-2.5 mb-1 text-sm" />
        ) : (
          budget.assignedLastMonth &&
          budget.groups.every((g) => g.categories.every((c) => c.assigned === 0)) && (
            <CopyLastMonth />
          )
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
            {budget.income.categories.length === 0
              ? t("budget.empty.noCategoriesYet")
              : t("budget.empty.aboutCategories")}
          </p>
        )}

        <div className="mt-3">
          <NewGroup
            placeholder={
              budget.groups.length === 0
                ? t("budget.newGroup.placeholderFirst")
                : t("budget.newGroup.placeholder")
            }
          />
        </div>

        {archived.length > 0 && <ArchivedCategories categories={archived} />}
      </section>
    </BudgetContext>
  );
}
