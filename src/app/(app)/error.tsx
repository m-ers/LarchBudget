"use client";

import { useEffect } from "react";
import { primaryButton } from "@/components/form";
import { useT } from "@/i18n/client";

/** Shown in place of a page that failed to load or render, with a way to retry. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="flex-1 rounded-2xl border border-line bg-surface p-8">
      <h1 className="text-lg font-semibold">{t("pageError.title")}</h1>
      <p className="mt-1 max-w-xl text-muted">{t("pageError.text")}</p>
      <button type="button" onClick={() => retry()} className={`${primaryButton} mt-5 px-4 py-2.5`}>
        {t("pageError.retry")}
      </button>
    </section>
  );
}
