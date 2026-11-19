"use client";

import { useRef, useState } from "react";
import { MAX_NAME_LENGTH } from "@/lib/limits";
import type { ActionResult } from "@/lib/result";
import { ErrorText } from "../form";
import { useSave } from "../use-save";

/**
 * The state behind a "type a name to add" field. Enter or clicking away
 * adds what was typed, the same as renaming; Escape drops it.
 */
export function useAddByName(add: (name: string) => Promise<ActionResult>) {
  const [draft, setDraft] = useState("");
  const { error, setError, pending, save } = useSave();
  const cancelled = useRef(false);

  function addDraft() {
    if (draft.trim() === "" || pending) return;
    save(
      () => add(draft),
      () => setDraft(""),
    );
  }

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

    /** For the surrounding form's `onSubmit`. The field stays focused, ready for the next name. */
    submit(e: React.FormEvent) {
      e.preventDefault();
      addDraft();
    },

    /** For the field's `onBlur`: clicking away adds what was typed, like Enter. */
    commit() {
      if (cancelled.current) {
        cancelled.current = false;
      } else {
        addDraft();
      }
    },

    /**
     * For the Escape key: drops what was typed and any error. Blurring the
     * field here makes `commit` run now and see the cancel.
     */
    cancel(field: HTMLElement) {
      cancelled.current = true;
      setDraft("");
      setError(null);
      field.blur();
    },
  };
}

/** The text field itself, with its hint or error beside it. Put it inside a `<form>`. */
export function AddByNameField({
  state,
  label,
  placeholder,
  autoFocus,
  onLeave,
  className = "",
}: {
  state: ReturnType<typeof useAddByName>;
  /** Accessible name of the field. */
  label: string;
  placeholder: string;
  autoFocus?: boolean;
  /** Runs when the field loses focus, after what was typed was added or dropped. */
  onLeave?: () => void;
  /** Size, weight and spacing of the text. */
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
        onBlur={() => {
          state.commit();
          onLeave?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") state.cancel(e.currentTarget);
        }}
        className={`-ml-2 w-56 rounded-md border bg-transparent px-[7px] py-[3px] placeholder:font-normal placeholder:text-muted focus:bg-surface focus:outline-none ${className} ${
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
