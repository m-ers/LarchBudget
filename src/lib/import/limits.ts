/** Limits for one bank file, shared by the import screen and the server. */

/** Larger files are refused before they are read. */
export const MAX_FILE_BYTES = 4_000_000;

/** A file with more rows than this is refused; export a shorter period instead. */
export const MAX_ROWS = 20_000;

/** No bank export has this many columns or cells this long; a file that does is something else. */
export const MAX_COLUMNS = 200;
export const MAX_CELL_LENGTH = 2_000;

/** Longest payee and note that are kept; the rest is cut off. */
export const MAX_PAYEE_LENGTH = 200;
export const MAX_NOTE_LENGTH = 500;
