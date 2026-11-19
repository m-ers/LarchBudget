"use client";

import { useState } from "react";
import { MAX_NAME_LENGTH } from "@/lib/limits";
import type { ActionResult } from "@/lib/result";
import { ErrorText } from "../form";
import { useSave } from "../use-save";

/** The state behind a "type a name, press Enter to add" field. */
export function useAddByName(add: (name: string) => Promise<ActionResult>) {
  const [draft, setDraft] = useState("");
  const { error, setError, pending, save } = useSave();

  return {
    draft,
    error,
    pending,
    /** For other saves that should report next to this field. */
    save,

    type(text: string) {
      setDraft(text);
      setError(null);
    },

    clear() {
      setDraft("");
      setError(null);
    },

    /** For the surrounding form's `onSubmit`. The field stays focused, ready for the next name. */
    submit(e: React.FormEvent) {
      e.preventDefault();
      if (draft.trim() === "" || pending) return;
      save(
        () => add(draft),
        () => setDraft(""),
      );
    },
  };
}

/** The text field itself, with its hint or error beside it. Put it inside a `<form>`. */
export function AddByNameField({
  state,
  label,
  placeholder,
  autoFocus,
  onEscape,
  className = "",
}: {
  state: ReturnType<typeof useAddByName>;
  /** Accessible name of the field. */
  label: string;
  placeholder: string;
  autoFocus?: boolean;
  onEscape?: () => void;
  className?: string;
}) {
  return (
    <>
      <input
        autoFocus={autoFocus}
        aria-label={label}
        aria-invalid={state.error ? true : undefined}
        placeholder={placeholder}
        maxLength={MAX_NAME_LENGTH}
        value={state.draft}
        onChange={(e) => state.type(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onEscape?.();
        }}
        className={`-ml-2 w-56 rounded-md border bg-transparent px-[7px] py-[3px] font-medium placeholder:font-normal placeholder:text-muted focus:bg-surface focus:outline-none ${className} ${
          state.error ? "border-bad" : "border-transparent hover:border-line focus:border-brand"
        }`}
      />
      {state.error ? (
        <ErrorText error={state.error} as="span" className="text-xs" />
      ) : (
        state.draft.trim() !== "" && (
          <span className="text-xs text-muted">{state.pending ? "Adding…" : "Enter to add"}</span>
        )
      )}
    </>
  );
}
