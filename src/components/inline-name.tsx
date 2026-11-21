"use client";

import { useImperativeHandle, useRef } from "react";
import { useT } from "@/i18n/client";
import { MAX_NAME_LENGTH } from "@/lib/limits";
import type { ActionResult } from "@/lib/result";
import { ErrorText } from "./form";
import { useInlineEdit } from "./use-inline-edit";

/** Lets a menu item start the rename, as clicking the name does. */
export type InlineNameHandle = { startEditing: () => void };

type Props = {
  ref?: React.Ref<InlineNameHandle>;
  value: string;
  /** Accessible name of the text field, e.g. "Category name". */
  label: string;
  onSave: (text: string) => Promise<ActionResult>;
  /** Classes for the text in both its resting and editing state. */
  className?: string;
};

/**
 * A name you click to rename in place. Enter or clicking away saves,
 * Escape cancels.
 */
export function InlineName({ ref, value, label, onSave, className = "" }: Props) {
  const edit = useInlineEdit(value, onSave);
  const field = useRef<HTMLInputElement>(null);
  const t = useT();
  useImperativeHandle(ref, () => ({
    startEditing() {
      // Already open (a refused name stays in the field): go back to it,
      // and keep what was typed.
      if (edit.text === null) edit.start();
      else {
        field.current?.focus();
        field.current?.select();
      }
    },
  }));

  if (edit.text === null) {
    return (
      <button
        type="button"
        onClick={edit.start}
        title={t("common.rename")}
        className={`-ml-2 min-w-0 truncate rounded-md px-2 py-1 text-left hover:bg-hover ${className} ${
          edit.pending ? "opacity-60" : ""
        }`}
      >
        {value}
      </button>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <input
        ref={field}
        autoFocus
        aria-label={label}
        aria-invalid={edit.error ? true : undefined}
        value={edit.text}
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => edit.setText(e.target.value)}
        onFocus={(e) => {
          // Only when editing starts, not when the window gets focus back.
          if (e.currentTarget.dataset.selected) return;
          e.currentTarget.dataset.selected = "true";
          e.currentTarget.select();
        }}
        onBlur={edit.commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") edit.cancel(e.currentTarget);
        }}
        className={`-ml-2 w-56 rounded-md border bg-surface px-[7px] py-[3px] focus:outline-none ${className} ${
          edit.error ? "border-bad" : "border-brand"
        }`}
      />
      <ErrorText
        error={edit.error}
        as="span"
        className="text-xs font-normal tracking-normal normal-case"
      />
    </span>
  );
}
