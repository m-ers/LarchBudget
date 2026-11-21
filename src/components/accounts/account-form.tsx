"use client";

import { createAccountAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { accountTypes } from "@/lib/account-types";
import type { IsoDate } from "@/lib/dates";
import { MAX_NAME_LENGTH } from "@/lib/limits";
import { ErrorText, Field, field, primaryButton, selectField } from "../form";
import { useSave } from "../use-save";
import { BalanceFields } from "./balance-fields";

export function AccountForm({
  amountPlaceholder,
  today,
}: {
  amountPlaceholder: string;
  today: IsoDate;
}) {
  const { error, pending, save } = useSave();
  const t = useT();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    save(
      () => createAccountAction(data),
      () => form.reset(),
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t("accounts.add.name")}>
        <input
          name="name"
          required
          maxLength={MAX_NAME_LENGTH}
          placeholder={t("accounts.add.namePlaceholder")}
          className={`${field} px-3`}
        />
      </Field>
      <Field label={t("accounts.add.type")}>
        <select name="type" defaultValue="checking" className={`${selectField} px-3`}>
          {accountTypes.map((type) => (
            <option key={type} value={type}>
              {t(`accounts.types.${type}`)}
            </option>
          ))}
        </select>
      </Field>
      <BalanceFields amountPlaceholder={amountPlaceholder} today={today} />
      <ErrorText error={error} className="text-sm" />
      <button
        type="submit"
        disabled={pending}
        className={`${primaryButton} px-3 py-2 disabled:opacity-60`}
      >
        {pending ? t("accounts.add.submitting") : t("accounts.add.submit")}
      </button>
    </form>
  );
}
