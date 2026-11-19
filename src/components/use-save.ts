"use client";

import { useState, useTransition } from "react";
import type { Failure } from "@/lib/result";

const UNREACHABLE: Failure = {
  ok: false,
  error: "Could not reach LarchBudget. Check your connection and try again.",
};

/**
 * Runs Server Actions for a component, and holds what every caller needs
 * around one: whether a save is under way, and the message of the last one
 * that failed. Call every Server Action through `save`, because it:
 *
 * - turns a server that cannot be reached into an ordinary message, where a
 *   bare call would throw and replace the page with an error screen;
 * - applies the outcome in the same transition as the refreshed data, so the
 *   interface never shows the old value in between.
 */
export function useSave() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Calls the action; `onSaved` runs only when it succeeded. */
  function save<Saved extends { ok: true }>(
    action: () => Promise<Saved | Failure>,
    onSaved?: (result: Saved) => void,
  ): void {
    startTransition(async () => {
      const result = await action().catch(() => UNREACHABLE);
      startTransition(() => {
        if (result.ok) {
          setError(null);
          onSaved?.(result);
        } else {
          setError(result.error);
        }
      });
    });
  }

  return { error, setError, pending, save };
}
