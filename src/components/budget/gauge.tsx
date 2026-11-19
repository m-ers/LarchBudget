import { gaugeLevel } from "@/lib/gauge";
import { WarningIcon } from "../icons";

type Props = {
  /** What the category holds at the end of the month (minor units). */
  available: number;
  /** Net transactions this month (negative = spent). */
  activity: number;
  /** `available` formatted as money. */
  label: string;
};

const tracks = { over: "bg-bad-track", empty: "bg-empty-track", ok: "bg-ok-track" };

/**
 * The Available amount as a gauge: the bar is filled by how much of what the
 * category held this month is still left, like a battery.
 *
 * Colour changes only when something needs attention: red with a warning
 * mark when overspent, grey when empty. The amount itself always stays in
 * the normal text colour.
 */
export function Gauge({ available, activity, label }: Props) {
  const { state, left } = gaugeLevel(available, activity);
  const hint = { over: "Overspent", empty: "Nothing left", ok: `${Math.round(left * 100)}% left` }[
    state
  ];

  return (
    <span
      title={hint}
      className={`relative ml-auto block h-7 w-33 overflow-hidden rounded-[7px] ${tracks[state]}`}
    >
      {state === "ok" && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-r-[3px] bg-ok-fill"
          style={{ width: `${left * 100}%` }}
        />
      )}
      <span
        className={`absolute inset-0 flex items-center justify-end gap-1.5 pr-2.5 tabular-nums ${
          state === "empty" ? "font-medium text-muted" : "font-semibold"
        }`}
      >
        {state === "over" && <WarningIcon />}
        {state === "over" && <span className="sr-only">Overspent: </span>}
        {label}
      </span>
    </span>
  );
}
