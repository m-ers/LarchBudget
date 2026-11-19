"use client";

import { useEffect } from "react";
import { primaryButton } from "@/components/form";

/** Shown in place of a page that failed to load or render, with a way to retry. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="flex-1 rounded-2xl border border-line bg-surface p-8">
      <h1 className="text-lg font-semibold">This page could not be loaded.</h1>
      <p className="mt-1 max-w-xl text-muted">
        Nothing was changed. If LarchBudget was restarting or the connection dropped, trying again
        usually works.
      </p>
      <button type="button" onClick={() => retry()} className={`${primaryButton} mt-5 px-4 py-2.5`}>
        Try again
      </button>
    </section>
  );
}
