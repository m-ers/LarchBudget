"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { formatAmount } from "@/lib/money";
import { RowAction } from "../budget/row-action";
import { AddRuleIcon, PencilIcon, SplitIcon } from "../icons";
import { RuleForm } from "../rules/rule-form";
import { TransactionForm, type EditedTransaction } from "./transaction-form";

/** Opens and closes the form under a row, for the edit button in its last cell. */
const RowEditing = createContext<{
  open: boolean;
  toggle: () => void;
  /** Opens the form with the transaction already divided in two parts. */
  openSplit: () => void;
  /** Takes the button, so focus can go back to it when the form closes. */
  button: (element: HTMLButtonElement | null) => void;
  /** The form to make a sorting rule from this transaction. */
  ruleOpen: boolean;
  toggleRule: () => void;
  ruleButton: (element: HTMLButtonElement | null) => void;
} | null>(null);

/** What a sorting rule made from a transaction starts with: the words to look for, and the category. */
export type RuleSeed = { text: string; place: string };

/**
 * One transaction in the list: its row, the parts of a split in small lines
 * under it, and the form to change it when that is open.
 */
export function TransactionRow({
  transaction,
  ruleSeed,
  currency,
  locale,
  children,
}: {
  transaction: EditedTransaction;
  /** Set when a rule can be made from this transaction; the form starts with it. */
  ruleSeed?: RuleSeed;
  currency: string;
  locale: string;
  /** The row's cells, drawn on the server; one of them holds `EditTransaction`. */
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Opened by the split button: the form starts divided in two parts.
  const [splitFirst, setSplitFirst] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const ruleButton = useRef<HTMLButtonElement>(null);
  const id = transaction.id;

  // On the To sort list, or narrowed to a category, a saved transaction can
  // leave the list. If the focus was in it, it goes to the next transaction
  // still to sort, as sorting with the picker does, and not back to the page.
  useLayoutEffect(
    () => () => {
      const mine = `[data-transaction-row="${id}"]`;
      let row = document.activeElement?.closest(mine)?.nextElementSibling;
      while (row) {
        const control = row.matches(mine)
          ? null
          : row.querySelector<HTMLElement>("[data-sort-control]");
        if (control) return control.focus();
        row = row.nextElementSibling;
      }
    },
    [id],
  );

  return (
    <RowEditing
      value={{
        open,
        toggle: () => {
          setSplitFirst(false);
          setRuleOpen(false);
          setOpen((was) => !was);
        },
        openSplit: () => {
          setSplitFirst(true);
          setRuleOpen(false);
          setOpen(true);
        },
        button: (element) => {
          button.current = element;
        },
        ruleOpen,
        toggleRule: () => {
          setOpen(false);
          setRuleOpen((was) => !was);
        },
        ruleButton: (element) => {
          ruleButton.current = element;
        },
      }}
    >
      <tr data-transaction-row={id} className="data-row group/row">
        {children}
      </tr>
      {transaction.parts.map((part, i) => (
        <tr key={i} data-transaction-row={id} className="part-row text-[13.5px] text-muted">
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
      {ruleOpen && ruleSeed && (
        <tr data-transaction-row={id}>
          <td colSpan={6} className="px-1 pt-1 pb-3">
            <RuleForm
              layout="inline"
              label={t("rules.form.fromTransaction")}
              submitLabel={t("rules.form.add")}
              text={ruleSeed.text}
              place={ruleSeed.place}
              onClose={(byKeyboard) => {
                setRuleOpen(false);
                if (byKeyboard) ruleButton.current?.focus();
              }}
            />
          </td>
        </tr>
      )}
      {open && (
        <tr data-transaction-row={id}>
          <td colSpan={6} className="px-1 pt-1 pb-3">
            <TransactionForm
              mode="edit"
              transaction={transaction}
              startSplit={splitFirst}
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

/**
 * The fork that opens the form with the transaction already split, so
 * splitting needs no visit to the pencil first. Not shown for a transaction
 * that is split already, or while a form is open (it has its own split button).
 */
export function SplitTransaction({
  describedAs,
  split,
}: {
  describedAs: string;
  /** The transaction is split already. */
  split: boolean;
}) {
  const t = useT();
  const editing = useContext(RowEditing);
  if (!editing || editing.open || split) return null;
  return (
    <RowAction
      label={t("transactions.form.splitRow", { what: describedAs })}
      title={t("transactions.form.split")}
      onClick={editing.openSplit}
      revealOn="row"
    >
      <SplitIcon width={15} height={15} />
    </RowAction>
  );
}

/**
 * The icon that opens the form to make a sorting rule from this
 * transaction: its words, and its category. Shown on row hover and keyboard focus.
 */
export function RuleFromTransaction({ describedAs }: { describedAs: string }) {
  const t = useT();
  const editing = useContext(RowEditing);
  if (!editing) return null;
  const { ruleOpen, toggleRule, ruleButton } = editing;
  return (
    <RowAction
      ref={ruleButton}
      label={t("rules.row.makeLabel", { what: describedAs })}
      title={t("rules.row.makeTitle")}
      onClick={toggleRule}
      revealOn={ruleOpen ? undefined : "row"}
      expanded={ruleOpen}
    >
      <AddRuleIcon width={15} height={15} />
    </RowAction>
  );
}
