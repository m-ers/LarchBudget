"use client";

import { setLanguageAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { ErrorText, Field, selectField } from "../form";
import { useSave } from "../use-save";

/**
 * The language LarchBudget speaks in this browser. "Automatic" follows the
 * browser's own language; `automatic` is the name of the one it gives now.
 * Each language is named in itself, whatever language the page is in.
 */
export function LanguageSetting({
  choice,
  automatic,
  options,
}: {
  choice: string;
  automatic: string;
  options: { code: string; name: string }[];
}) {
  const t = useT();
  const { error, pending, save } = useSave();

  return (
    <>
      <Field
        label={t("settings.language.label")}
        tip={t("settings.language.tip")}
        tipId="language-tip"
      >
        {/* Not controlled: the choice shows at once, and `key` resets it when the page comes back. */}
        <select
          key={choice}
          defaultValue={choice}
          disabled={pending}
          aria-describedby="language-tip"
          onChange={(e) => {
            const next = e.target.value;
            save(() => setLanguageAction(next));
          }}
          className={`${selectField} px-2.5 disabled:opacity-60`}
        >
          <option value="auto">{t("settings.language.automatic", { language: automatic })}</option>
          {options.map(({ code, name }) => (
            <option key={code} value={code} lang={code}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <ErrorText error={error} className="mt-1.5 text-sm" />
    </>
  );
}
