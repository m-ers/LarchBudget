"use client";

import { useRef, useState } from "react";
import { removeTargetAction, setTargetAction } from "@/app/actions";
import type { CategoryRow } from "@/db/budget";
import { useDateLocale, useT } from "@/i18n/client";
import { addMonths, formatMonthShort, type Month } from "@/lib/dates";
import { formatAmount, parseMoney, toInputValue } from "@/lib/money";
import { targetKinds, type Target, type TargetKind } from "@/lib/targets";
import { ErrorText, primaryButton } from "../form";
import { useSave } from "../use-save";
import { useBudget } from "./budget-context";

const control =
  "rounded-[9px] border border-line bg-surface px-2.5 py-1 focus:border-brand focus:outline-none";

/** How many months "by a month" offers, starting with the current one. */
const MONTHS_OFFERED = 36;

/** The month a new "by a month" target starts at: a year from now. */
const FIRST_CHOICE = 12;

/**
 * "Set target" or "Change target", in a row under the category: the kind,
 * the amount, and for "by a month" the month. Like moving money, the row
 * shows the new target at once; Escape or Cancel closes the form, and so
 * does a change that was saved.
 */
export function TargetForm({
  category,
  onClose,
}: {
  category: CategoryRow;
  /** `byKeyboard`: the focus was in the form, and should go back to the row. */
  onClose: (byKeyboard: boolean) => void;
}) {
  const { currency, locale, figures, show } = useBudget();
  const dates = useDateLocale();
  const { error, setError, pending, save } = useSave();
  const t = useT();
  const { target } = category;
  const [kind, setKind] = useState<TargetKind>(target?.kind ?? "monthly");
  const [amount, setAmount] = useState(target ? toInputValue(target.amount, currency, locale) : "");
  const [month, setMonth] = useState<Month>(
    target?.kind === "byMonth" ? target.month : addMonths(figures.thisMonth, FIRST_CHOICE),
  );
  const form = useRef<HTMLFormElement>(null);

  // The coming months, and a month already chosen that is not among them.
  const months = Array.from({ length: MONTHS_OFFERED }, (_, i) => addMonths(figures.thisMonth, i));
  if (!months.includes(month)) months.push(month);
  months.sort();

  function close() {
    onClose(form.current?.contains(document.activeElement) ?? false);
  }

  /** Cancel and Escape. A change that is already on its way cannot be called back. */
  function cancel() {
    if (!pending) close();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const typed = amount;
    const when = kind === "byMonth" ? month : null;
    // Read the way the server reads it. What cannot be saved is not shown;
    // the server says why.
    const cents = parseMoney(typed, currency, locale);
    save(
      () => setTargetAction(category.id, kind, typed, when),
      close,
      undefined,
      () => {
        if (cents === null || cents <= 0) return;
        const next: Target =
          kind === "byMonth" ? { kind, amount: cents, month } : { kind, amount: cents };
        show({ type: "target", categoryId: category.id, target: next });
      },
    );
  }

  function remove() {
    save(
      () => removeTargetAction(category.id),
      close,
      undefined,
      () => show({ type: "target", categoryId: category.id, target: null }),
    );
  }

  return (
    <tr className="data-row">
      <td className="h-[43px] w-[54px]" />
      <td colSpan={4} className="py-1.5">
        <form
          ref={form}
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
          aria-label={t("budget.targetForm.formLabel", { name: category.name })}
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1"
        >
          <select
            aria-label={t("budget.targetForm.kindLabel")}
            value={kind}
            onChange={(e) => setKind(e.target.value as TargetKind)}
            className={`${control} h-[33px]`}
          >
            {targetKinds.map((k) => (
              <option key={k} value={k}>
                {t(`budget.targetForm.kind.${k}`)}
              </option>
            ))}
          </select>
          <input
            autoFocus
            aria-label={t("budget.targetForm.amountLabel")}
            aria-invalid={error ? true : undefined}
            inputMode="decimal"
            autoComplete="off"
            placeholder={formatAmount(0, currency, locale)}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            onFocus={(e) => e.currentTarget.select()}
            className={`${control} w-24 text-right tabular-nums ${error ? "border-bad" : ""}`}
          />
          {kind === "byMonth" && (
            <select
              aria-label={t("budget.targetForm.monthLabel")}
              value={month}
              onChange={(e) => setMonth(e.target.value as Month)}
              className={`${control} h-[33px]`}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonthShort(m, dates)}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={pending}
            className={`${primaryButton} px-3 py-1 disabled:opacity-60`}
          >
            {t("budget.targetForm.save")}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-[9px] px-2.5 py-1 font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-60"
          >
            {t("budget.targetForm.cancel")}
          </button>
          {target && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-[9px] px-2.5 py-1 font-medium text-muted transition-colors hover:bg-hover hover:text-bad disabled:opacity-60"
            >
              {t("budget.targetForm.remove")}
            </button>
          )}
          <ErrorText error={error} as="span" className="text-xs" />
        </form>
      </td>
    </tr>
  );
}
