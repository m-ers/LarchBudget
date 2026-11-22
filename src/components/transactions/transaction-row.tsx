"use client";

import { createContext, useContext, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { formatAmount } from "@/lib/money";
import { RowAction } from "../budget/row-action";
import { PencilIcon } from "../icons";
import { TransactionForm, type EditedTransaction } from "./transaction-form";

/** Opens and closes the form under a row, for the edit button in its last cell. */
const RowEditing = createContext<{
  open: boolean;
  toggle: () => void;
  /** Takes the button, so focus can go back to it when the form closes. */
  button: (element: HTMLButtonElement | null) => void;
} | null>(null);

/**
 * One transaction in the list: its row, the parts of a split in small lines
 * under it, and the form to change it when that is open.
 */
export function TransactionRow({
  transaction,
  currency,
  locale,
  children,
}: {
  transaction: EditedTransaction;
  currency: string;
  locale: string;
  /** The row's cells, drawn on the server; one of them holds `EditTransaction`. */
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <RowEditing
      value={{
        open,
        toggle: () => setOpen((was) => !was),
        button: (element) => {
          button.current = element;
        },
      }}
    >
      <tr className="data-row group/row">{children}</tr>
      {transaction.parts.map((part, i) => (
        <tr key={i} className="part-row text-[13.5px] text-muted">
          <td colSpan={3} />
          <td className="h-[26px] truncate pl-2.5">
            {part.categoryId === null
              ? t("transactions.picker.noCategory")
              : part.categoryArchived
                ? t("transactions.picker.archived", { name: part.category ?? "" })
                : part.category}
          </td>
          <td className="text-right whitespace-nowrap tabular-nums">
            {part.amount > 0 ? "+" : ""}
            {formatAmount(part.amount, currency, locale)}
          </td>
          <td />
        </tr>
      ))}
      {open && (
        <tr>
          <td colSpan={6} className="px-1 pt-1 pb-3">
            <TransactionForm
              mode="edit"
              transaction={transaction}
              currency={currency}
              locale={locale}
              onClose={(byKeyboard) => {
                setOpen(false);
                if (byKeyboard) button.current?.focus();
              }}
            />
          </td>
        </tr>
      )}
    </RowEditing>
  );
}

/** The pencil that opens the form under its row. Shown on row hover and keyboard focus. */
export function EditTransaction({ describedAs }: { describedAs: string }) {
  const t = useT();
  const editing = useContext(RowEditing);
  if (!editing) return null;
  const { open, toggle, button } = editing;
  return (
    <RowAction
      ref={button}
      label={t("transactions.form.editButton", { what: describedAs })}
      title={t("transactions.form.editTitle")}
      onClick={toggle}
      revealOn={open ? undefined : "row"}
      expanded={open}
    >
      <PencilIcon width={15} height={15} />
    </RowAction>
  );
}
