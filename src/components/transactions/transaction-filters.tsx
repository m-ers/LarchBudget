"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Month } from "@/lib/dates";
import {
  MAX_SEARCH_LENGTH,
  transactionsHref,
  type TransactionFilter,
} from "@/lib/transactions-address";
import { quietButton } from "../form";

type Props = {
  filter: TransactionFilter;
  accounts: { id: number; name: string; closed: boolean }[];
  categories: { id: number; name: string; archived: boolean }[];
};

const SEARCH_DELAY = 400;

/**
 * Narrows the "All" list. What is chosen lives in the address, so a filtered
 * list can be linked to and survives paging. A search is applied on Enter, or
 * a moment after typing stops.
 */
export function TransactionFilters({ filter, accounts, categories }: Props) {
  const router = useRouter();
  // What the controls show. A search is kept as typed, spaces and all.
  const [fields, setFields] = useState<TransactionFilter>(filter);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // When the address changes by itself (a link, not these controls), show it.
  const address = transactionsHref({ showAll: true, filter });
  const [seen, setSeen] = useState(address);
  const [shown, setShown] = useState(address);
  if (address !== seen) {
    setSeen(address);
    if (address !== shown) {
      setShown(address);
      setFields(filter);
    }
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function show(next: TransactionFilter) {
    clearTimeout(timer.current);
    setFields(next);
    const trimmed = { ...next, q: next.q?.trim() || undefined };
    const href = transactionsHref({ showAll: true, filter: trimmed });
    if (href === shown) return;
    setShown(href);
    router.replace(href);
  }

  const filtered = Object.values(fields).some((value) => value !== undefined && value !== "");
  // Like `field` in form.tsx, but each control is as wide as its own width says.
  const choice =
    "rounded-[9px] border border-line bg-surface px-2.5 py-2 text-[14.5px] placeholder:text-muted/60 focus:border-brand focus:outline-none";

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        show(fields);
      }}
      className="flex flex-wrap items-center gap-2 px-1 pb-2.5"
    >
      <input
        type="search"
        aria-label="Search payee or note"
        placeholder="Search payee or note"
        value={fields.q ?? ""}
        maxLength={MAX_SEARCH_LENGTH}
        onChange={(e) => {
          const next = { ...fields, q: e.target.value };
          setFields(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => show(next), SEARCH_DELAY);
        }}
        className={`${choice} w-60`}
      />
      <select
        aria-label="Account"
        value={fields.accountId ?? ""}
        onChange={(e) => show({ ...fields, accountId: Number(e.target.value) || undefined })}
        className={`${choice} w-44`}
      >
        <option value="">All accounts</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
            {account.closed ? " (closed)" : ""}
          </option>
        ))}
      </select>
      <select
        aria-label="Category"
        value={fields.category ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          show({
            ...fields,
            category: value === "" ? undefined : value === "none" ? "none" : Number(value),
          });
        }}
        className={`${choice} w-52`}
      >
        <option value="">All categories</option>
        <option value="none">No category</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
            {category.archived ? " (archived)" : ""}
          </option>
        ))}
      </select>
      <input
        type="month"
        aria-label="Month"
        value={fields.month ?? ""}
        onChange={(e) =>
          show({ ...fields, month: (e.target.value || undefined) as Month | undefined })
        }
        className={`${choice} w-40`}
      />
      {filtered && (
        <button type="button" onClick={() => show({})} className={`${quietButton} text-[14.5px]`}>
          Clear
        </button>
      )}
    </form>
  );
}
