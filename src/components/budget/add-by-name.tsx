"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { MAX_NAME_LENGTH } from "@/lib/limits";
import type { ActionResult } from "@/lib/result";
import { ErrorText } from "../form";
import { useSaveOnLeave } from "../use-inline-edit";
import { useSave } from "../use-save";

/**
 * The state behind a "type a name to add" field. Enter or clicking away
 * adds what was typed, the same as renaming; Escape drops it.
 */
export function useAddByName(add: (name: string) => Promise<ActionResult>) {
  const [draft, setDraft] = useState("");
  const { error, setError, pending, save } = useSave();

  function addDraft() {
    const submitted = draft;
    if (submitted.trim() === "") return;
    // Cleared straight away, ready for the next name, even while this one is
    // still being saved. It comes back if it could not be added and nothing
    // new was typed meanwhile.
    setDraft("");
    save(
      () => add(submitted),
      undefined,
      () => setDraft((current) => (current === "" ? submitted : current)),
    );
  }

  const { commit, cancel } = useSaveOnLeave(addDraft, () => {
    setDraft("");
    setError(null);
  });

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

    /**
     * For the field's `onBlur`: clicking away adds what was typed, like
     * Enter. Returns whether the field was really left.
     */
    commit,

    /** For the Escape key: drops what was typed and any error. */
    cancel,
  };
}

/** The text field itself, with its hint or error beside it. Put it inside a `<form>`. */
export function AddByNameField({
  state,
  label,
  placeholder,
  autoFocus,
  wide,
  onLeave,
  className = "",
}: {
  state: ReturnType<typeof useAddByName>;
  /** Accessible name of the field. */
  label: string;
  placeholder: string;
  autoFocus?: boolean;
  /** Room for a longer placeholder, such as one with an example. */
  wide?: boolean;
  /** Runs when the field loses focus, after what was typed was added or dropped. */
  onLeave?: () => void;
  /** Size, weight and spacing of the text. */
  className?: string;
}) {
  const t = useT();
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
        onBlur={(e) => {
          if (state.commit(e)) onLeave?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") state.cancel(e.currentTarget);
        }}
        className={`-ml-2 ${wide ? "w-80" : "w-56"} rounded-md border bg-transparent px-[7px] py-[3px] placeholder:font-normal placeholder:text-muted focus:bg-surface focus:outline-none ${className} ${
          state.error ? "border-bad" : "border-transparent hover:border-line focus:border-brand"
        }`}
      />
      {state.error ? (
        <ErrorText error={state.error} as="span" className="text-xs" />
      ) : state.pending ? (
        <span className="text-xs text-muted">{t("budget.addByName.adding")}</span>
      ) : (
        state.draft.trim() !== "" && (
          <span className="text-xs text-muted">{t("budget.addByName.hint")}</span>
        )
      )}
    </>
  );
}
