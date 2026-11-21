import { getTransactionCounts } from "@/app/queries";
import { getT } from "@/i18n/server";

/** The number of transactions waiting to be sorted, shown in the navigation. */
export async function ToSortBadge() {
  const { toSort } = await getTransactionCounts();
  const t = await getT();
  if (toSort === 0) return null;

  return (
    <span className="ml-auto rounded-full bg-accent px-1.5 text-xs leading-5 font-semibold text-rail tabular-nums">
      <span aria-hidden="true">{toSort}</span>
      <span className="sr-only">{t("nav.toSort", { count: toSort })}</span>
    </span>
  );
}
