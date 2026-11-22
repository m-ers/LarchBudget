"use client";

import { useId, useRef, useState } from "react";
import { createRuleAction, updateRuleAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { MAX_RULE_TEXT_LENGTH } from "@/lib/limits";
import { cleanRuleText } from "@/lib/rules";
import { ErrorText, Field, primaryButton, selectField, sizedField } from "../form";
import { CategoryOptions, NO_CATEGORY } from "../transactions/category-options";
import { useSave } from "../use-save";

/** What the category field holds while no category is chosen. */
const NOT_CHOSEN = "";

type Props = {
  /** The rule being changed; left out when making a new one. */
  ruleId?: number;
  /** What the form starts with: the text to look for, and where it sends transactions (see `placeOf`). */
  text?: string;
  place?: string;
  /** An archived category the rule is in already, which it may stay in. */
  archived?: Map<number, string>;
  /** "panel": the fields one under the other, for a narrow column. "inline": side by side, for under a row. */
  layout: "panel" | "inline";
  /** The name of the form for screen readers. */
  label: string;
  submitLabel: string;
  /** Called when the form should go away, after a save or Cancel; `byKeyboard` when Escape did it. */
  onClose?: (byKeyboard: boolean) => void;
  /** After a save, with how many transactions the rule sorted or moved just now. */
  onSaved?: (sorted: number) => void;
};

/**
 * Makes a sorting rule or changes one: the words to look for in a payee or
 * note, and the category it sorts into. Saving also sorts what is still to
 * sort and fits.
 */
export function RuleForm({
  ruleId,
  text: startText = "",
  place: startPlace = NOT_CHOSEN,
  archived,
  layout,
  label,
  submitLabel,
  onClose,
  onSaved,
}: Props) {
  const t = useT();
  const { error, setError, pending, save } = useSave();
  const [text, setText] = useState(startText);
  const [place, setPlace] = useState(startPlace);
  const textField = useRef<HTMLInputElement>(null);
  const tipId = useId();

  function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (cleanRuleText(text) === "") {
      setError(t("errors.rules.empty"));
      textField.current?.focus();
      return;
    }
    if (place === NOT_CHOSEN) {
      setError(t("errors.rules.noCategory"));
      return;
    }
    const target = place === NO_CATEGORY ? NO_CATEGORY : Number(place);
    save(
      () =>
        ruleId === undefined
          ? createRuleAction(text, target)
          : updateRuleAction(ruleId, text, target),
      (result) => {
        onSaved?.(result.sorted);
        if (ruleId === undefined) {
          // Ready for the next rule.
          setText("");
          setPlace(NOT_CHOSEN);
          textField.current?.focus();
        }
        onClose?.(false);
      },
    );
  }

  const inline = layout === "inline";
  const control = "px-2.5";

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onClose && !pending) onClose(true);
      }}
      aria-label={label}
      className={
        inline
          ? "flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-[0_1px_3px_rgb(0_0_0/0.06)]"
          : "flex flex-col gap-3.5"
      }
    >
      <div className={inline ? "min-w-48 flex-1" : undefined}>
        <Field label={t("rules.form.text")} tip={t("rules.form.textTip")} tipId={tipId}>
          <input
            ref={textField}
            autoFocus={inline}
            value={text}
            maxLength={MAX_RULE_TEXT_LENGTH}
            autoComplete="off"
            aria-describedby={tipId}
            placeholder={t("rules.form.textPlaceholder")}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            className={`${sizedField} w-full ${control}`}
          />
        </Field>
      </div>
      <div className={inline ? "w-60 max-w-full" : undefined}>
        <Field label={t("rules.form.category")}>
          <select
            value={place}
            onChange={(e) => {
              setPlace(e.target.value);
              setError(null);
            }}
            className={`${selectField} ${control} ${place === NOT_CHOSEN ? "text-muted" : ""}`}
          >
            <option value={NOT_CHOSEN}>{t("transactions.picker.choose")}</option>
            <CategoryOptions archived={archived} />
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          disabled={pending}
          className={`${primaryButton} px-3.5 py-2 disabled:opacity-60`}
        >
          {submitLabel}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={pending}
            className="rounded-[9px] px-2.5 py-1.5 font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-60"
          >
            {t("rules.form.cancel")}
          </button>
        )}
      </div>
      <ErrorText error={error} className={inline ? "basis-full text-[13.5px]" : "text-[13.5px]"} />
    </form>
  );
}
