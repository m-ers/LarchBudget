/** Longest name an account, group or category may have. */
export const MAX_NAME_LENGTH = 60;

/** Amounts above this, in minor units, are almost certainly typos (and keep sums exact). */
export const MAX_AMOUNT = 1_000_000_000_00;

/** The earliest day an account's balance may be from; an earlier one is a typo in the year. */
export const EARLIEST_BALANCE_DATE = "2000-01-01";

/** Longest text a sorting rule may look for; a longer one is not what a bank writes twice. */
export const MAX_RULE_TEXT_LENGTH = 100;

/** The most sorting rules there can be. A file of 20,000 rows is checked against each of them. */
export const MAX_RULES = 500;
