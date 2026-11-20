import type { IsoDate } from "@/lib/dates";
import { Field, field } from "../form";

/**
 * What an account held at the end of a day, and that day. Asked when an
 * account is added and when its balance is changed. Put it inside a `<form>`.
 */
export function BalanceFields({
  amountPlaceholder,
  today,
  amount = "",
  date = today,
  autoFocus,
}: {
  amountPlaceholder: string;
  /** The latest day a balance can be from. */
  today: IsoDate;
  /** The fields' starting values: the amount as typed, and the day. */
  amount?: string;
  date?: IsoDate;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Field label="Balance">
        <input
          autoFocus={autoFocus}
          name="startingBalance"
          inputMode="decimal"
          autoComplete="off"
          placeholder={amountPlaceholder}
          defaultValue={amount}
          className={`${field} px-3 tabular-nums`}
        />
        <span className="text-xs font-normal text-muted">
          For a credit card you owe money on, enter a negative amount.
        </span>
      </Field>
      <Field label="On">
        <input
          type="date"
          name="balanceDate"
          required
          max={today}
          defaultValue={date}
          className={`${field} px-3 tabular-nums`}
        />
        <span className="text-xs font-normal text-muted">
          What the account held at the end of that day. Transactions from before that day that you
          import later are filled in behind it; they do not change this balance.
        </span>
      </Field>
    </>
  );
}
