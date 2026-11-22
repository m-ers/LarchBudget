"use client";

import { useContext, useId, useRef, useState } from "react";
import {
  addTransactionAction,
  editTransactionAction,
  type TransactionForm as FormValues,
} from "@/app/actions";
import type { SortTarget, SplitPart } from "@/db/transactions";
import { useDateLocale, useT } from "@/i18n/client";
import { formatDate, today, type IsoDate } from "@/lib/dates";
import { formatMoney, parseMoney, toInputValue } from "@/lib/money";
import { ErrorText, Field, field, primaryButton, selectField, sizedField } from "../form";
import { InfoIcon, PlusIcon } from "../icons";
import { useSave } from "../use-save";
import { AccountChoices, CategoryChoices } from "./category-choices";

/** A transaction as the form changes it. */
export type EditedTransaction = {
  id: number;
  date: IsoDate;
  amount: number;
  payee: string | null;
  note: string | null;
  imported: boolean;
  accountId: number;
  toSort: boolean;
  categoryId: number | null;
  category: string | null;
  categoryArchived: boolean;
  parts: SplitPart[];
};

type Props = {
  currency: string;
  locale: string;
  /** `byKeyboard`: the focus was in the form, and should go back to where it came from. */
  onClose: (byKeyboard: boolean) => void;
} & (
  | {
      mode: "add";
      /** The account to start with. */
      accountId: number;
      /** After adding, with where it went. */
      onAdded?: (place: SortTarget | "split") => void;
    }
  | { mode: "edit"; transaction: EditedTransaction }
);

const UNSORTED = "unsorted";
const NO_CATEGORY = "ready";
/** A part whose category is not chosen yet. */
const NOT_CHOSEN = "";

type Part = { key: number; category: string; amount: string };

/** Keys that tell the parts in a form apart while they are added and removed. */
let partKeys = 0;
const newPart = (category: string, amount: string): Part => ({
  key: ++partKeys,
  category,
  amount,
});

/**
 * Adds a transaction by hand, or changes one: date, payee, account (when
 * adding), amount, category or a split, and note. An imported transaction
 * shows its date and amount without fields: they stay as the bank has them.
 *
 * Amounts are typed without a sign; "Out" and "In" say which way the money
 * went. A split's parts go the same way, unless typed with a minus. While
 * the first part has not been typed in, it takes whatever the other parts
 * leave, so a receipt is split by typing only the smaller amounts.
 */
export function TransactionForm(props: Props) {
  const { currency, locale, onClose } = props;
  const t = useT();
  const dates = useDateLocale();
  const groups = useContext(CategoryChoices);
  const accounts = useContext(AccountChoices);
  const { error, setError, pending, save } = useSave();
  const form = useRef<HTMLFormElement>(null);
  const ids = useId();
  const editing = props.mode === "edit" ? props.transaction : null;
  const locked = editing?.imported ?? false;

  const startSign = editing && editing.amount > 0 ? 1 : -1;
  const [date, setDate] = useState<string>(editing?.date ?? today());
  const [payee, setPayee] = useState(editing?.payee ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [accountId, setAccountId] = useState(
    props.mode === "add" ? props.accountId : props.transaction.accountId,
  );
  // An imported transaction stays in its bank's account, and one in a closed account stays there.
  const accountChosen =
    !locked && accounts.some((account) => account.id === (editing?.accountId ?? accountId));
  const [direction, setDirection] = useState<"out" | "in">(startSign > 0 ? "in" : "out");
  const [amount, setAmount] = useState(
    editing ? toInputValue(Math.abs(editing.amount), currency, locale) : "",
  );
  const [place, setPlace] = useState(
    !editing || editing.toSort
      ? UNSORTED
      : editing.categoryId === null
        ? NO_CATEGORY
        : String(editing.categoryId),
  );
  const [parts, setParts] = useState<Part[] | null>(() =>
    editing && editing.parts.length > 0
      ? editing.parts.map((part) =>
          newPart(
            part.categoryId === null ? NO_CATEGORY : String(part.categoryId),
            toInputValue(part.amount * startSign, currency, locale),
          ),
        )
      : null,
  );
  // The first part takes the rest until it is typed in; an existing split is left as it is.
  const [firstFollows, setFirstFollows] = useState(!editing || editing.parts.length === 0);

  const read = (typed: string) => parseMoney(typed, currency, locale);
  const total = read(amount);

  /** The archived categories this transaction is in already: they can stay. */
  const archived = new Map<number, string>();
  if (editing?.categoryArchived && editing.categoryId !== null) {
    archived.set(editing.categoryId, editing.category ?? "");
  }
  for (const part of editing?.parts ?? []) {
    if (part.categoryArchived && part.categoryId !== null) {
      archived.set(part.categoryId, part.category ?? "");
    }
  }

  const hasIncome = groups.some((group) => group.id === "income");
  const noCategory = hasIncome
    ? t("transactions.picker.noCategoryTransfer")
    : t("transactions.picker.noCategoryIncomeOrTransfer");

  const options = (
    <>
      <option value={NO_CATEGORY}>{noCategory}</option>
      {[...archived].map(([id, name]) => (
        <option key={id} value={id}>
          {t("transactions.picker.archived", { name })}
        </option>
      ))}
      {groups.map((group) => (
        <optgroup key={String(group.id)} label={group.name}>
          {group.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );

  /** The parts with the first one set to what the others leave, while it follows. */
  function withFirstFollowing(list: Part[], whole: number | null, follows = firstFollows): Part[] {
    if (!follows || whole === null || list.length < 2) return list;
    const others = list.slice(1).reduce((sum, part) => sum + (read(part.amount) ?? 0), 0);
    return [
      { ...list[0], amount: toInputValue(whole - others, currency, locale) },
      ...list.slice(1),
    ];
  }

  function changeAmount(typed: string) {
    setAmount(typed);
    setError(null);
    if (parts) setParts(withFirstFollowing(parts, read(typed)));
  }

  function split() {
    setParts([newPart(place === UNSORTED ? NOT_CHOSEN : place, amount), newPart(NOT_CHOSEN, "")]);
    setFirstFollows(true);
    setError(null);
  }

  function changePart(key: number, change: Partial<Omit<Part, "key">>) {
    if (!parts) return;
    const follows = firstFollows && !(change.amount !== undefined && key === parts[0].key);
    if (!follows) setFirstFollows(false);
    setParts(
      withFirstFollowing(
        parts.map((part) => (part.key === key ? { ...part, ...change } : part)),
        total,
        follows,
      ),
    );
    setError(null);
  }

  function addPart() {
    if (!parts) return;
    const left = remainder();
    setParts([
      ...parts,
      newPart(NOT_CHOSEN, left && left > 0 ? toInputValue(left, currency, locale) : ""),
    ]);
  }

  function removePart(key: number) {
    if (!parts) return;
    const rest = parts.filter((part) => part.key !== key);
    if (rest.length === 1) {
      // One part is no split: the transaction goes where that part went.
      setPlace(rest[0].category === NOT_CHOSEN ? UNSORTED : rest[0].category);
      setParts(null);
    } else {
      if (key === parts[0].key) setFirstFollows(false);
      setParts(withFirstFollowing(rest, total, firstFollows && key !== parts[0].key));
    }
    setError(null);
  }

  /** What is not split yet, as typed (positive means part of the amount is left). */
  function remainder(): number | null {
    if (!parts || total === null) return null;
    return total - parts.reduce((sum, part) => sum + (read(part.amount) ?? 0), 0);
  }

  /** Whether the focus is in the form, and so should go back where it came from when it closes. */
  const focusInForm = () => form.current?.contains(document.activeElement) ?? false;

  function close(byKeyboard = focusInForm()) {
    onClose(byKeyboard);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Read now: Safari drops the focus from the Save button while it is disabled.
    const byKeyboard = focusInForm();
    if (parts?.some((part) => part.category === NOT_CHOSEN)) {
      setError(t("errors.transactions.partCategory"));
      return;
    }
    const values: FormValues = {
      // An imported transaction's date and amount go back as they were.
      date: editing && locked ? editing.date : date,
      amount: editing && locked ? toInputValue(Math.abs(editing.amount), currency, locale) : amount,
      direction,
      payee,
      note,
      accountId: editing && accountChosen ? accountId : undefined,
      place: parts
        ? parts.map((part) => ({
            categoryId: part.category === NO_CATEGORY ? null : Number(part.category),
            amount: part.amount,
          }))
        : place === UNSORTED || place === NO_CATEGORY
          ? place
          : Number(place),
    };
    const chosen: SortTarget | "split" = parts
      ? "split"
      : place === UNSORTED || place === NO_CATEGORY
        ? place
        : Number(place);
    if (props.mode === "add") {
      save(
        () => addTransactionAction(accountId, values),
        () => {
          close(byKeyboard);
          props.onAdded?.(chosen);
        },
      );
    } else {
      save(
        () => editTransactionAction(props.transaction.id, values),
        () => close(byKeyboard),
      );
    }
  }

  const left = remainder();
  const control = `${field} px-2.5`;

  return (
    <form
      ref={form}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) close();
      }}
      aria-label={
        editing
          ? t("transactions.form.editLabel", {
              what: editing.payee ?? t("transactions.page.noName"),
            })
          : t("transactions.form.addLabel")
      }
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-[0_1px_3px_rgb(0_0_0/0.06)]"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-40">
          {editing && locked ? (
            <Locked label={t("transactions.form.date")}>{formatDate(editing.date, dates)}</Locked>
          ) : (
            <Field label={t("transactions.form.date")}>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setError(null);
                }}
                className={`${control} h-[38px]`}
              />
            </Field>
          )}
        </div>
        <div className="min-w-48 flex-1">
          <Field label={t("transactions.form.payee")}>
            <input
              autoFocus
              value={payee}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setPayee(e.target.value)}
              className={control}
            />
          </Field>
        </div>
        {accountChosen && (
          <div className="w-44">
            <Field label={t("transactions.form.account")}>
              <select
                value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}
                className={`${selectField} px-2.5`}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {editing && locked ? (
          <div className="w-44">
            <Locked label={t("transactions.form.amount")}>
              <span className="tabular-nums">{formatMoney(editing.amount, currency, locale)}</span>
            </Locked>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor={`${ids}-amount`}>{t("transactions.form.amount")}</label>
            <div className="flex gap-1.5">
              <div
                role="radiogroup"
                aria-label={t("transactions.form.direction")}
                className="flex h-[38px] rounded-[9px] border border-line p-[3px]"
              >
                {(["out", "in"] as const).map((way) => (
                  <label
                    key={way}
                    className={`flex cursor-pointer items-center rounded-[7px] px-2.5 text-[14px] has-focus-visible:outline-2 has-focus-visible:outline-brand ${
                      direction === way ? "bg-ok-track text-ink" : "font-normal text-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`${ids}-direction`}
                      value={way}
                      checked={direction === way}
                      onChange={() => setDirection(way)}
                      className="sr-only"
                    />
                    {t(`transactions.form.${way}`)}
                  </label>
                ))}
              </div>
              <input
                id={`${ids}-amount`}
                required
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => changeAmount(e.target.value)}
                className={`${sizedField} w-28 shrink-0 px-2.5 text-right tabular-nums`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex w-[25rem] max-w-full flex-col gap-1.5 text-sm font-medium">
          {parts ? (
            <>
              <span>{t("transactions.form.category")}</span>
              <ul className="flex flex-col gap-1.5">
                {parts.map((part, i) => (
                  <li key={part.key} className="flex items-center gap-1.5">
                    <select
                      aria-label={t("transactions.form.partCategory", { n: i + 1 })}
                      value={part.category}
                      onChange={(e) => changePart(part.key, { category: e.target.value })}
                      className={`${sizedField} h-[38px] min-w-0 flex-1 px-2.5 ${part.category === NOT_CHOSEN ? "text-muted" : ""}`}
                    >
                      <option value={NOT_CHOSEN} disabled>
                        {t("transactions.picker.choose")}
                      </option>
                      {options}
                    </select>
                    <input
                      aria-label={t("transactions.form.partAmount", { n: i + 1 })}
                      inputMode="decimal"
                      autoComplete="off"
                      value={part.amount}
                      onChange={(e) => changePart(part.key, { amount: e.target.value })}
                      className={`${sizedField} w-28 shrink-0 px-2.5 text-right tabular-nums`}
                    />
                    <button
                      type="button"
                      aria-label={t("transactions.form.removePart", { n: i + 1 })}
                      title={t("transactions.form.removePartTitle")}
                      onClick={() => removePart(part.key)}
                      className="grid size-[30px] shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      <span aria-hidden="true" className="text-lg leading-none">
                        ×
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 pr-9 font-normal">
                <button
                  type="button"
                  onClick={addPart}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[14px] font-medium text-brand hover:bg-hover"
                >
                  <PlusIcon width={14} height={14} />
                  {t("transactions.form.addPart")}
                </button>
                {/* Always there, so its first message is read out too. */}
                <span
                  aria-live="polite"
                  className={`text-[13.5px] tabular-nums ${left !== null && left < 0 ? "text-bad" : "text-muted"}`}
                >
                  {left === null || left === 0
                    ? null
                    : left > 0
                      ? t("transactions.form.left", {
                          amount: formatMoney(left, currency, locale),
                        })
                      : t("transactions.form.tooMuch", {
                          amount: formatMoney(-left, currency, locale),
                        })}
                </span>
              </div>
            </>
          ) : (
            <>
              <label htmlFor={`${ids}-category`}>{t("transactions.form.category")}</label>
              <div className="flex items-center gap-1.5">
                <select
                  id={`${ids}-category`}
                  value={place}
                  onChange={(e) => {
                    setPlace(e.target.value);
                    setError(null);
                  }}
                  className={`${sizedField} h-[38px] min-w-0 flex-1 px-2.5 ${place === UNSORTED ? "text-muted" : ""}`}
                >
                  <option value={UNSORTED}>{t("transactions.picker.choose")}</option>
                  {options}
                </select>
                <button
                  type="button"
                  onClick={split}
                  className="h-[38px] shrink-0 rounded-[9px] px-2.5 text-[14px] font-medium text-brand transition-colors hover:bg-hover"
                >
                  {t("transactions.form.split")}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="min-w-48 flex-1">
          <Field label={t("transactions.form.note")}>
            <input
              value={note}
              maxLength={500}
              autoComplete="off"
              onChange={(e) => setNote(e.target.value)}
              className={control}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          disabled={pending}
          className={`${primaryButton} px-3.5 py-1.5 disabled:opacity-60`}
        >
          {props.mode === "add" ? t("transactions.form.add") : t("transactions.form.save")}
        </button>
        <button
          type="button"
          onClick={() => close()}
          disabled={pending}
          className="rounded-[9px] px-2.5 py-1.5 font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-60"
        >
          {t("transactions.form.cancel")}
        </button>
        <ErrorText error={error} as="span" className="text-[13.5px]" />
      </div>
    </form>
  );
}

/** A date or amount that cannot be changed, with why in the tip after its label. */
function Locked({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="flex items-center gap-1.5">
        {label}
        <span
          aria-hidden="true"
          title={t("transactions.form.importedTip")}
          className="cursor-help text-muted"
        >
          <InfoIcon width={14} height={14} />
        </span>
      </span>
      <span className="flex h-[38px] items-center text-[15px] font-normal">
        {children}
        {/* The tip after the label is for the eye; this is what a screen reader reads. */}
        <span className="sr-only">{t("transactions.form.importedTip")}</span>
      </span>
    </div>
  );
}
