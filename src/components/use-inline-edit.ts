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
 * "Save on leaving, drop on Escape", for every field that edits in place.
 * Leaving the field (Tab, clicking elsewhere, or an Enter that moves on)
 * runs `save`; Escape runs `drop` instead. The whole window losing focus is
 * not leaving: what was typed stays, and so does the focus.
 */
export function useSaveOnLeave(save: () => void, drop: () => void) {
  const dropped = useRef(false);

  return {
    /**
     * For the field's `onBlur`. Returns whether the field was really left,
     * whether what it held was saved or dropped.
     */
    commit(e: React.FocusEvent<HTMLElement>): boolean {
      if (windowLostFocus(e)) return false;
      if (dropped.current) dropped.current = false;
      else save();
      return true;
    },

    /**
     * For the Escape key. Blurring the field here makes `commit` run now and
     * see the drop, whatever the browser does when the field is removed.
     */
    cancel(field: HTMLElement) {
      dropped.current = true;
      drop();
      field.blur();
    },
  };
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
  const { commit, cancel } = useSaveOnLeave(
    () => {
      if (text?.trim() === saved) {
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
    () => {
      setText(null);
      setError(null);
    },
  );

  return {
    text,
    setText,
    error,
    pending,

    /** Begin editing, starting from the stored value. */
    start: () => setText(saved),

    /** For the field's `onBlur`: saves what was typed, if it changed. */
    commit,

    /** For the Escape key: drops what was typed. */
    cancel,
  };
}
