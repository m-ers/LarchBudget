import { useId } from "react";
import type { IsoDate } from "@/lib/dates";
import { EARLIEST_BALANCE_DATE } from "@/lib/limits";
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
  const id = useId();
  return (
    <>
      <Field
        label="Balance"
        hint="For a credit card you owe money on, enter a negative amount."
        hintId={`${id}-amount`}
      >
        <input
          autoFocus={autoFocus}
          name="startingBalance"
          aria-describedby={`${id}-amount`}
          inputMode="decimal"
          autoComplete="off"
          placeholder={amountPlaceholder}
          defaultValue={amount}
          className={`${field} px-3 tabular-nums`}
        />
      </Field>
      <Field
        label="On"
        hint="What the account held at the end of that day. Transactions from before that day that you import later are filled in behind it; they do not change this balance."
        hintId={`${id}-date`}
      >
        <input
          type="date"
          name="balanceDate"
          required
          min={EARLIEST_BALANCE_DATE}
          max={today}
          defaultValue={date}
          aria-describedby={`${id}-date`}
          className={`${field} px-3 tabular-nums`}
        />
      </Field>
    </>
  );
}
