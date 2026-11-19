"use client";

import { useRef, useState } from "react";
import type { ActionResult } from "@/lib/result";
import { useSave } from "./use-save";

/**
 * True when a field's blur only means the whole window lost focus, for
 * example when switching to another app or tab. The field stays the active
 * element then, and gets focus back when the window does, so a half-typed
 * value should not be saved yet.
 */
export function windowLostFocus(e: React.FocusEvent<HTMLElement>): boolean {
  return document.activeElement === e.currentTarget;
}

/**
 * Editing one value in place: it is saved when the field loses focus and
 * left alone when Escape is pressed.
 *
 * @param saved the stored value, as the text the field starts with
 * @param onSave saves what was typed
 */
export function useInlineEdit(saved: string, onSave: (typed: string) => Promise<ActionResult>) {
  // null = not being edited, so the stored value is shown.
  const [text, setText] = useState<string | null>(null);
  const { error, setError, pending, save } = useSave();
  const cancelled = useRef(false);

  return {
    text,
    setText,
    error,
    pending,

    /** Begin editing, starting from the stored value. */
    start: () => setText(saved),

    /** For the field's `onBlur`: saves what was typed, if it changed. */
    commit() {
      if (cancelled.current) {
        cancelled.current = false;
      } else if (text?.trim() === saved) {
        setText(null);
        setError(null);
      } else if (text !== null) {
        const typed = text;
        save(
          () => onSave(typed),
          () => setText(null),
        );
      }
    },

    /**
     * For the Escape key: drops what was typed. Blurring the field here makes
     * `commit` run now and see the cancel, whatever the browser does when the
     * field is removed.
     */
    cancel(field: HTMLElement) {
      cancelled.current = true;
      setText(null);
      setError(null);
      field.blur();
    },
  };
}
