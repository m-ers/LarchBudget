"use client";

import { assignTargetsAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { formatMoneyTrimmed } from "@/lib/money";
import { TargetIcon } from "../icons";
import type { useSave } from "../use-save";
import { targetChanges } from "./budget-changes";
import { useBudget } from "./budget-context";

/**
 * The small button in the header, under the month, while targets still
 * need money in the month: "◎ €455 to assign". One click adds what each
 * needs to its Assigned amount, and every figure changes at once. With the
 * needs met, the button goes; `state` lives above it, so a failure can
 * still be told when it comes back.
 */
export function AssignTargets({ state }: { state: ReturnType<typeof useSave> }) {
  const { month, currency, locale, figures, show, announce, focusTitle } = useBudget();
  const t = useT();
  const count = figures.groups.flatMap((g) => g.categories).filter((c) => c.needed > 0).length;
  const amount = formatMoneyTrimmed(figures.needed, currency, locale);

  return (
    <button
      type="button"
      disabled={state.pending}
      aria-label={t("budget.assignTargets.label", { amount })}
      title={t("budget.assignTargets.need", { count, amount })}
      onClick={() => {
        // The button goes at once, and the focus would fall back to the
        // start of the page with it.
        focusTitle();
        announce("");
        state.save(
          // With the current month the needs on the page were worked out
          // for: when that has changed, nothing is assigned, and the button
          // comes back with the reason above the groups.
          () => assignTargetsAction(month, figures.thisMonth),
          () => announce(t("budget.assignTargets.done")),
          undefined,
          () => {
            for (const change of targetChanges(figures.groups)) show(change);
          },
        );
      }}
      className="mt-2 flex w-fit items-center gap-1.5 rounded-[7px] bg-white/10 py-[3px] pr-2.5 pl-2 text-[13px] leading-4 font-medium whitespace-nowrap tabular-nums transition-colors hover:bg-white/20 disabled:opacity-60"
    >
      <TargetIcon width={14} height={14} strokeWidth={2.2} />
      {t("budget.assignTargets.button", { amount })}
    </button>
  );
}
