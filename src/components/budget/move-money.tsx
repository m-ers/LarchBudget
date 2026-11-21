"use client";

import { useRef, useState } from "react";
import { moveMoneyAction } from "@/app/actions";
import type { CategoryRow, MoneyEnd } from "@/db/budget";
import { formatAmount, formatMoney, parseMoney, toInputValue } from "@/lib/money";
import { ErrorText, primaryButton } from "../form";
import { useSave } from "../use-save";
import { moveChanges } from "./budget-changes";
import { useBudget } from "./budget-context";

/** "out" moves the category's money elsewhere; "in" covers its overspending from elsewhere. */
export type Flow = "out" | "in";

const READY = "ready";

const control =
  "rounded-[9px] border border-line bg-surface px-2.5 py-1 focus:border-brand focus:outline-none";

/**
 * "Move money" or "Cover overspending", in a row under the category:
 * an amount and where it goes to or comes from. It changes the Assigned
 * amounts of the viewed month, and every figure that moves shows at once.
 * Escape or Cancel closes it; so does a move that was saved.
 */
export function MoveMoney({
  category,
  flow,
  onClose,
}: {
  category: CategoryRow;
  flow: Flow;
  /** `byKeyboard`: the focus was in the form, and should go back to the row. */
  onClose: (byKeyboard: boolean) => void;
}) {
  const { month, currency, locale, figures, show } = useBudget();
  const { error, setError, pending, save } = useSave();
  const out = flow === "out";
  // Covering starts from what the category is short.
  const [amount, setAmount] = useState(
    out ? "" : toInputValue(-category.available, currency, locale),
  );
  const [other, setOther] = useState(READY);
  const form = useRef<HTMLFormElement>(null);
  const money = (minorUnits: number) => formatMoney(minorUnits, currency, locale);

  function close() {
    onClose(form.current?.contains(document.activeElement) ?? false);
  }

  /** Cancel and Escape. A move that is already on its way cannot be called back. */
  function cancel() {
    if (!pending) close();
  }

  // The end the money comes from, and what it has to give: a category
  // cannot give more than it holds now, or than it holds over all time.
  const otherEnd: MoneyEnd = other === READY ? READY : Number(other);
  const source = out ? category.id : otherEnd;
  const sourceCategory = figures.groups.flatMap((g) => g.categories).find((c) => c.id === source);
  const sourceHolds = sourceCategory
    ? Math.min(sourceCategory.available, sourceCategory.balance)
    : figures.readyToAssign;
  const wanted = parseMoney(amount, currency, locale);
  const tooMuch =
    wanted !== null && wanted > 0 && wanted > Math.max(0, sourceHolds)
      ? sourceCategory
        ? `${sourceCategory.name} holds ${money(Math.max(0, sourceHolds))}; moving more leaves it overspent.`
        : `Only ${money(Math.max(0, sourceHolds))} is ready to assign; moving more assigns more than you have.`
      : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const [from, to] = out ? [category.id, otherEnd] : [otherEnd, category.id];
    const typed = amount;
    // Read the way the server reads it. What cannot be moved is not shown;
    // the server says why.
    const cents = parseMoney(typed, currency, locale);
    // What each end has assigned as shown now: the server moves from exactly
    // these amounts, so a request that is sent twice moves the money once.
    const assignedTo = (end: MoneyEnd) =>
      figures.groups.flatMap((g) => g.categories).find((c) => c.id === end)?.assigned ?? null;
    const seen = { from: assignedTo(from), to: assignedTo(to) };
    save(
      () => moveMoneyAction(from, to, month, typed, seen),
      close,
      undefined,
      () => {
        if (cents === null || cents <= 0) return;
        for (const change of moveChanges(figures.groups, { from, to, amount: cents })) show(change);
      },
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
          aria-label={out ? `Move money from ${category.name}` : `Cover ${category.name}`}
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1"
        >
          {out ? "Move" : "Cover"}
          <input
            autoFocus
            aria-label={out ? "Amount to move" : "Amount to cover"}
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
            className={`${control} w-28 text-right tabular-nums ${error ? "border-bad" : ""}`}
          />
          {out ? "to" : "from"}
          <select
            aria-label={out ? "Move to" : "Cover from"}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            className={`${control} h-[33px] max-w-72`}
          >
            <option value={READY}>Ready to assign ({money(figures.readyToAssign)})</option>
            {figures.groups.map((group) => {
              const others = group.categories.filter((c) => c.id !== category.id);
              return (
                others.length > 0 && (
                  <optgroup key={group.id ?? group.name} label={group.name}>
                    {others.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({money(c.available)})
                      </option>
                    ))}
                  </optgroup>
                )
              );
            })}
          </select>
          <button
            type="submit"
            disabled={pending}
            className={`${primaryButton} px-3 py-1 disabled:opacity-60`}
          >
            {out ? "Move" : "Cover"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-[9px] px-2.5 py-1 font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-60"
          >
            Cancel
          </button>
          <ErrorText error={error} as="span" className="text-xs" />
          {!error && tooMuch && <span className="text-xs text-muted">{tooMuch}</span>}
        </form>
      </td>
    </tr>
  );
}
