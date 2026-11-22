"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { transactionsHref } from "@/lib/transactions-address";
import { PlusIcon } from "../icons";
import { TransactionForm } from "./transaction-form";

/**
 * "Add transaction" at the end of the tab bar, and the form it opens on a
 * line of its own under the bar (the bar wraps). Added from the To sort
 * list with a category, the transaction is not in that list: the All list
 * opens, where it is.
 */
export function AddTransaction({
  accounts,
  accountId,
  showAll,
  currency,
  locale,
}: {
  accounts: { id: number; name: string }[];
  accountId: number;
  showAll: boolean;
  currency: string;
  locale: string;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="ml-auto flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[14.5px] font-medium text-brand transition-colors hover:bg-hover"
      >
        <PlusIcon width={15} height={15} />
        {t("transactions.form.addButton")}
      </button>
      {open && (
        <div className="order-last basis-full pt-1.5">
          <TransactionForm
            mode="add"
            accounts={accounts}
            accountId={accountId}
            currency={currency}
            locale={locale}
            onClose={(byKeyboard) => {
              setOpen(false);
              if (byKeyboard) button.current?.focus();
            }}
            onAdded={(place) => {
              if (!showAll && place !== "unsorted") {
                router.push(transactionsHref({ showAll: true, filter: {} }));
              }
            }}
          />
        </div>
      )}
    </>
  );
}
