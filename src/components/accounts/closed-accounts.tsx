"use client";

import { reopenAccountAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { ErrorText } from "../form";
import { useSave } from "../use-save";

/** The quiet line under the accounts table that lists closed accounts, each with "Reopen". */
export function ClosedAccounts({ accounts }: { accounts: { id: number; name: string }[] }) {
  const { error, pending, save } = useSave();
  const t = useT();

  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 text-sm text-muted ${
        pending ? "opacity-60" : ""
      }`}
    >
      <span>{t("accounts.closed.title")}</span>
      {accounts.map((account) => (
        <span key={account.id} className="flex items-center gap-1">
          {account.name}
          <button
            type="button"
            onClick={() => save(() => reopenAccountAction(account.id))}
            aria-label={t("accounts.closed.reopenLabel", { name: account.name })}
            className="rounded-md px-1.5 py-0.5 font-medium text-brand transition-colors hover:bg-hover"
          >
            {t("accounts.closed.reopen")}
          </button>
        </span>
      ))}
      <ErrorText error={error} as="span" />
    </div>
  );
}
