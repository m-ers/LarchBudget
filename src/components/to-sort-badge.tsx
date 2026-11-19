import { getTransactionCounts } from "@/app/queries";

/** The number of transactions waiting to be sorted, shown in the navigation. */
export async function ToSortBadge() {
  const { toSort } = await getTransactionCounts();
  if (toSort === 0) return null;

  return (
    <span className="ml-auto rounded-full bg-accent px-1.5 text-xs leading-5 font-semibold text-rail tabular-nums">
      <span className="sr-only">, </span>
      {toSort}
      <span className="sr-only"> to sort</span>
    </span>
  );
}
