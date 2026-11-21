"use client";

import { assignTargetsAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { formatMoneyTrimmed } from "@/lib/money";
import { ErrorText } from "../form";
import type { useSave } from "../use-save";
import { targetChanges } from "./budget-changes";
import { useBudget } from "./budget-context";

/**
 * The quiet line above the groups while targets still need money in the
 * month: one click adds what each needs to its Assigned amount, and every
 * figure changes at once. With the needs met, the line goes; `state` lives
 * above it, so a failure can still be told when the line comes back.
 */
export function AssignTargets({ state }: { state: ReturnType<typeof useSave> }) {
  const { month, currency, locale, figures, show } = useBudget();
  const t = useT();
  const count = figures.groups.flatMap((g) => g.categories).filter((c) => c.needed > 0).length;

  return (
    <p className="mx-3.5 mt-2.5 mb-1 text-sm text-muted">
      {t("budget.assignTargets.need", {
        count,
        amount: formatMoneyTrimmed(figures.needed, currency, locale),
      })}{" "}
      <button
        type="button"
        disabled={state.pending}
        onClick={() =>
          state.save(
            () => assignTargetsAction(month),
            undefined,
            undefined,
            () => {
              for (const change of targetChanges(figures.groups)) show(change);
            },
          )
        }
        className="rounded-md px-1.5 py-0.5 font-medium text-brand transition-colors hover:bg-hover disabled:opacity-60"
      >
        {t("budget.assignTargets.assign")}
      </button>
      <ErrorText error={state.error} as="span" className="ml-2" />
    </p>
  );
}
