"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { RuleForm } from "./rule-form";

/** The form that makes a new rule, with a line under it saying how many transactions it sorted. */
export function AddRule() {
  const t = useT();
  const [sorted, setSorted] = useState<number | null>(null);
  return (
    <>
      <RuleForm
        layout="panel"
        label={t("rules.add.title")}
        submitLabel={t("rules.form.add")}
        onSaved={setSorted}
      />
      <p role="status" className="mt-3 text-[13.5px] text-muted">
        {sorted !== null && sorted > 0 ? t("rules.add.sorted", { count: sorted }) : null}
      </p>
    </>
  );
}
