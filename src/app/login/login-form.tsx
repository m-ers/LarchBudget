"use client";

import { useActionState } from "react";
import { ErrorText, field, primaryButton } from "@/components/form";
import { useT } from "@/i18n/client";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const t = useT();

  return (
    <form action={action} className="flex w-full max-w-xs flex-col gap-3">
      <label htmlFor="password" className="text-sm font-medium">
        {t("login.password")}
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        className={`${field} px-3`}
      />
      <ErrorText error={state.error} className="text-sm" />
      <button
        type="submit"
        disabled={pending}
        className={`${primaryButton} px-3 py-2 disabled:opacity-60`}
      >
        {pending ? t("login.submitting") : t("login.submit")}
      </button>
    </form>
  );
}
