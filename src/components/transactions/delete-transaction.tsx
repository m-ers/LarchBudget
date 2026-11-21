"use client";

import { deleteTransactionAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { TrashIcon } from "../icons";
import { RowAction } from "../budget/row-action";
import { ErrorText } from "../form";
import { useSave } from "../use-save";

type Props = {
  transactionId: number;
  /** The payee and date, e.g. "Coffee Bar on Nov 17, 2026". */
  describedAs: string;
  /** The payee, the amount with its currency, and the date, for the question. */
  question: string;
};

/** Deletes a transaction after asking. Shown on row hover and keyboard focus. */
export function DeleteTransaction({ transactionId, describedAs, question }: Props) {
  const t = useT();
  const { error, save } = useSave();

  function remove() {
    if (window.confirm(question)) save(() => deleteTransactionAction(transactionId));
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <ErrorText error={error} as="span" className="text-xs" />
      <RowAction
        label={t("transactions.delete.label", { what: describedAs })}
        title={t("transactions.delete.title")}
        onClick={remove}
        revealOn="row"
      >
        <TrashIcon width={15} height={15} />
      </RowAction>
    </span>
  );
}
