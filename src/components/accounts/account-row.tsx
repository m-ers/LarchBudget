"use client";

import { useState } from "react";
import {
  closeAccountAction,
  deleteAccountAction,
  renameAccountAction,
  setAccountBalanceAction,
  setAccountTypeAction,
} from "@/app/actions";
import { accountTypeLabels, accountTypes, type AccountType } from "@/lib/account-types";
import type { IsoDate } from "@/lib/dates";
import { RowAction } from "../budget/row-action";
import { ErrorText, primaryButton, quietButton } from "../form";
import { ArchiveIcon, TrashIcon } from "../icons";
import { InlineName } from "../inline-name";
import { useSave } from "../use-save";
import { BalanceFields } from "./balance-fields";

type Props = {
  id: number;
  name: string;
  type: AccountType;
  /** What it holds now, formatted as money. */
  balance: string;
  /** What was entered for it, as the "Balance" field shows it, and that day. */
  startingBalance: string;
  balanceDate: IsoDate;
  /** Its transactions, not counting the starting balance. */
  transactionCount: number;
  amountPlaceholder: string;
  today: IsoDate;
  locale: string;
};

/** What deleting an account does, asked before it happens. */
function deleteQuestion(name: string, transactionCount: number, locale: string): string {
  if (transactionCount === 0) return `Delete "${name}"?`;
  const transactions =
    transactionCount === 1
      ? "1 transaction"
      : `${transactionCount.toLocaleString(locale)} transactions`;
  return `Delete "${name}" and its ${transactions}? What was spent from it disappears from your categories. This cannot be undone.`;
}

/**
 * One account in the table: rename it by clicking its name, pick its type,
 * and on hover close or delete it, or edit its balance in a row below.
 */
export function AccountRow(props: Props) {
  const { id, name, type, balance, transactionCount, locale } = props;
  const [editing, setEditing] = useState(false);
  const { error, pending, save } = useSave();

  function remove() {
    if (window.confirm(deleteQuestion(name, transactionCount, locale))) {
      save(() => deleteAccountAction(id));
    }
  }

  return (
    <>
      <tr className="data-row group/row">
        <td className="h-[43px] pl-3.5">
          <div className={`flex min-w-0 items-center gap-1 ${pending ? "opacity-60" : ""}`}>
            <InlineName
              value={name}
              label="Account name"
              onSave={(text) => renameAccountAction(id, text)}
              className="text-[15.5px] font-medium"
            />
            <RowAction
              label={`Close ${name}`}
              title="Close account"
              onClick={() => save(() => closeAccountAction(id))}
              revealOn="row"
            >
              <ArchiveIcon width={15} height={15} />
            </RowAction>
            <RowAction
              label={`Delete ${name}`}
              title="Delete account"
              onClick={remove}
              revealOn="row"
            >
              <TrashIcon width={15} height={15} />
            </RowAction>
          </div>
          <ErrorText error={error} className="pb-1.5 text-xs" />
        </td>
        <td>
          <TypePicker id={id} name={name} type={type} />
        </td>
        <td className="pr-3.5">
          <div className="flex items-center justify-end gap-2">
            {!editing && (
              <RowAction
                label={`Edit balance of ${name}`}
                title="Edit balance"
                onClick={() => setEditing(true)}
                revealOn="row"
              >
                <span className="text-[13px] font-medium">Edit balance</span>
              </RowAction>
            )}
            <span className="font-semibold tabular-nums">{balance}</span>
          </div>
        </td>
      </tr>
      {editing && <BalanceEditor {...props} onClose={() => setEditing(false)} />}
    </>
  );
}

/** The account's type, saved as soon as another is picked. */
function TypePicker({ id, name, type }: { id: number; name: string; type: AccountType }) {
  // The type picked while it is being saved.
  const [draft, setDraft] = useState<AccountType | null>(null);
  const { error, pending, save } = useSave();

  function pick(next: AccountType) {
    setDraft(next);
    save(
      () => setAccountTypeAction(id, next),
      () => setDraft(null),
      () => setDraft(null),
    );
  }

  return (
    <span className="flex flex-col items-start">
      <select
        aria-label={`Type of ${name}`}
        aria-invalid={error ? true : undefined}
        value={draft ?? type}
        onChange={(e) => pick(e.target.value as AccountType)}
        className={`-ml-2 cursor-pointer appearance-none rounded-md border border-transparent bg-transparent px-2 py-1 text-muted hover:bg-hover focus:border-brand focus:outline-none ${
          pending ? "opacity-60" : ""
        }`}
      >
        {accountTypes.map((option) => (
          <option key={option} value={option}>
            {accountTypeLabels[option]}
          </option>
        ))}
      </select>
      <ErrorText error={error} as="span" className="text-xs" />
    </span>
  );
}

/** "Edit balance": the account's entered balance and its day, in a row under the account. */
function BalanceEditor({
  id,
  name,
  startingBalance,
  balanceDate,
  amountPlaceholder,
  today,
  onClose,
}: Props & { onClose: () => void }) {
  const { error, pending, save } = useSave();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    save(() => setAccountBalanceAction(id, data), onClose);
  }

  return (
    <tr>
      <td colSpan={3} className="px-1.5 pb-3">
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          aria-label={`Balance of ${name}`}
          className="flex items-start gap-5 rounded-xl bg-hover p-4"
        >
          <div className="grid flex-1 grid-cols-2 gap-5">
            <BalanceFields
              amountPlaceholder={amountPlaceholder}
              today={today}
              amount={startingBalance}
              date={balanceDate}
              autoFocus
            />
          </div>
          <div className="mt-[26px] flex shrink-0 gap-2">
            <button
              type="submit"
              disabled={pending}
              className={`${primaryButton} px-3.5 py-2 disabled:opacity-60`}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={onClose} className={`${quietButton} bg-surface`}>
              Cancel
            </button>
          </div>
        </form>
        <ErrorText error={error} className="mt-2 px-4 text-sm" />
      </td>
    </tr>
  );
}
