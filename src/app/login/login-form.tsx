"use client";

import { useActionState } from "react";
import { ErrorText, field, primaryButton } from "@/components/form";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="flex w-full max-w-xs flex-col gap-3">
      <label htmlFor="password" className="text-sm font-medium">
        Password
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
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
