/** Longest name an account, group or category may have. */
export const MAX_NAME_LENGTH = 60;

/** Amounts above this, in minor units, are almost certainly typos (and keep sums exact). */
export const MAX_AMOUNT = 1_000_000_000_00;

/** The earliest day an account's balance may be from; an earlier one is a typo in the year. */
export const EARLIEST_BALANCE_DATE = "2000-01-01";
