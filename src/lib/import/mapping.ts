import { parseBankAmount } from "./amount";
import type { IsoDate } from "../dates";
import {
  dateOrders,
  detectDateOrder,
  isDateOrderAmbiguous,
  looksLikeDate,
  parseBankDate,
  type DateOrder,
} from "./dates";
import { MAX_COLUMNS } from "./limits";

/** Which column of a bank file holds what. Column numbers start at 0; -1 or null means "none". */
export type Mapping = {
  /** Whether the first row holds column names instead of a transaction. */
  hasHeader: boolean;
  date: number;
  dateOrder: DateOrder;
  /** The amount; when `amountIn` is set, only the money out. */
  amount: number;
  /**
   * For files with one column for money out and one for money in (Debit and
   * Credit, Af and Bij): the money in. A row uses whichever of the two cells
   * is filled; `indicator` is not used then. Missing in mappings saved
   * before this existed.
   */
  amountIn?: number | null;
  /** A column saying whether the amount is money out or in ("Af"/"Bij", "Debit"/"Credit"). */
  indicator: number | null;
  payee: number | null;
  note: number | null;
  /** Flip the sign, for exports that list spending as positive amounts. */
  invert: boolean;
};

export type ParsedRow = {
  date: IsoDate;
  /** Minor units; negative = money out. */
  amount: number;
  payee: string | null;
  note: string | null;
  /**
   * The whole line as it stands in the file. This, not the fields above, is
   * what identifies a transaction when a later file overlaps, so reading a
   * file with other column choices never imports a transaction twice.
   */
  raw: string;
};

/** A row that could not be read; `line` counts from 1, as a spreadsheet would. */
export type SkippedRow = { line: number; reason: string };

/** True when `value` has the shape of a mapping with sensible column numbers. */
export function isMapping(value: unknown): value is Mapping {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  const column = (v: unknown) =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAX_COLUMNS;
  const optional = (v: unknown) => v === null || column(v);
  return (
    typeof m.hasHeader === "boolean" &&
    typeof m.invert === "boolean" &&
    column(m.date) &&
    column(m.amount) &&
    (m.amountIn === undefined || optional(m.amountIn)) &&
    optional(m.indicator) &&
    optional(m.payee) &&
    optional(m.note) &&
    dateOrders.includes(m.dateOrder as DateOrder)
  );
}

/** How many columns the file has, judged from its first rows. */
export function columnCount(rows: string[][]): number {
  return Math.max(0, ...rows.slice(0, 50).map((row) => row.length));
}

const OUT = new Set(["af", "debet", "debit", "d", "db", "dr", "-", "out", "uit"]);
const IN = new Set(["bij", "credit", "c", "cr", "+", "in"]);

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Column names banks use, most specific first. A name matches when it equals or starts with one. */
const NAMES = {
  date: [
    "transactiedatum",
    "transaction date",
    "boekdatum",
    "boekingsdatum",
    "booking date",
    "datum",
    "date",
  ],
  amount: ["transactiebedrag", "bedrag", "amount", "betrag", "montant"],
  indicator: ["af bij", "debet credit", "debit credit", "credit debit", "d c", "dc", "bij af"],
  payee: [
    "naam omschrijving",
    "naam tegenpartij",
    "tegenpartij",
    "counterparty",
    "payee",
    "merchant",
    "name",
    "naam",
    "description",
    "omschrijving",
  ],
  note: [
    "mededelingen",
    "omschrijving",
    "description",
    "memo",
    "details",
    "notes",
    "reference",
    "kenmerk",
  ],
};

/** Column names of a money-out and a money-in column that stand apart. Short names must match whole. */
const OUT_NAMES = [
  "bedrag af",
  "debit",
  "debet",
  "withdrawal",
  "paid out",
  "money out",
  "af",
  "uit",
];
const IN_NAMES = ["bedrag bij", "credit", "deposit", "paid in", "money in", "bij", "in"];

/** Column names that contain an amount word but are not the transaction amount. */
const NOT_AMOUNT = ["saldo", "balance", "oorspr", "original", "koers", "rate"];

function findByName(header: string[], names: string[], exclude: number[] = []): number {
  const cells = header.map(normalise);
  for (const name of names) {
    const exact = cells.findIndex((cell, i) => cell === name && !exclude.includes(i));
    if (exact !== -1) return exact;
  }
  for (const name of names) {
    const starts = cells.findIndex(
      (cell, i) =>
        cell.startsWith(name) &&
        !exclude.includes(i) &&
        !NOT_AMOUNT.some((word) => cell.includes(word)),
    );
    if (starts !== -1) return starts;
  }
  return -1;
}

const share = (values: string[], test: (value: string) => boolean) =>
  values.length === 0 ? 0 : values.filter(test).length / values.length;

const isOut = (value: string) => OUT.has(value.toLowerCase());
const isIn = (value: string) => IN.has(value.toLowerCase());

/** The values of a column that tell money out from money in: all are one or the other. */
const isIndicator = (values: string[]) =>
  values.length > 0 && values.every((v) => isOut(v) || isIn(v));

/** The column whose name is one of `names`, whole or followed by more words ("debit eur"). */
function findOutOrIn(header: string[], names: string[], exclude: number[]): number {
  const cells = header.map(normalise);
  for (const name of names) {
    const found = cells.findIndex(
      (cell, i) =>
        !exclude.includes(i) && (cell === name || (name.length > 3 && cell.startsWith(`${name} `))),
    );
    if (found !== -1) return found;
  }
  return -1;
}

/**
 * Among numeric columns, the one that explains how another column moves from
 * row to row: that other column is a running balance, and this one holds the
 * amounts. Rows may run newest first or oldest first, so the change between
 * two rows is the amount of either the first or the second of them, in every
 * pair. Null when no column is a balance.
 */
function amountBesideBalance(
  body: string[][],
  candidates: number[],
  digits: number,
): number | null {
  const values = (i: number) => body.map((row) => parseBankAmount(row[i] ?? "", digits));
  const columns = new Map(candidates.map((i) => [i, values(i)]));
  for (const balance of candidates) {
    const b = columns.get(balance)!;
    for (const amount of candidates) {
      if (amount === balance) continue;
      const a = columns.get(amount)!;
      let pairs = 0;
      let firstOwn = 0;
      let secondOwn = 0;
      for (let i = 0; i + 1 < body.length; i++) {
        if (b[i] === null || b[i + 1] === null || a[i] === null || a[i + 1] === null) continue;
        pairs++;
        const change = Math.abs(b[i]! - b[i + 1]!);
        if (change === Math.abs(a[i]!)) firstOwn++;
        if (change === Math.abs(a[i + 1]!)) secondOwn++;
      }
      if (pairs > 0 && (firstOwn === pairs || secondOwn === pairs)) return amount;
    }
  }
  return null;
}

/** Guesses the mapping for a parsed file. Columns it cannot find are left at -1 or null. */
export function detectMapping(rows: string[][], digits: number, monthFirst = false): Mapping {
  const first = rows[0] ?? [];
  const width = columnCount(rows);
  // A header row names things; it holds no dates and no amounts with decimals.
  const hasHeader =
    rows.length > 1 &&
    !first.some((cell) => looksLikeDate(cell) || /^[+-]?\d+[.,]\d{2}$/.test(cell.trim()));

  const body = rows.slice(hasHeader ? 1 : 0, 200);
  const column = (i: number) => body.map((row) => row[i] ?? "").filter((value) => value !== "");
  const columns = Array.from({ length: width }, (_, i) => column(i));
  const holdsAmounts = (i: number) =>
    columns[i].length > 0 && share(columns[i], (v) => parseBankAmount(v, digits) !== null) >= 0.8;

  let date = hasHeader ? findByName(first, NAMES.date) : -1;
  if (date === -1) date = columns.findIndex((values) => share(values, looksLikeDate) >= 0.8);

  // A column named like "Af Bij" saying out or in, next to one amount column.
  let indicator = hasHeader ? findByName(first, NAMES.indicator) : -1;
  if (indicator !== -1 && !isIndicator(columns[indicator] ?? [])) indicator = -1;

  // Two columns, one for money out and one for money in, found by their names.
  let amount = -1;
  let amountIn = -1;
  if (hasHeader && indicator === -1) {
    const out = findOutOrIn(first, OUT_NAMES, [date]);
    const into = findOutOrIn(first, IN_NAMES, [date, out]);
    if (out !== -1 && into !== -1 && holdsAmounts(out) && holdsAmounts(into)) {
      amount = out;
      amountIn = into;
    }
  }

  if (amount === -1) amount = hasHeader ? findByName(first, NAMES.amount, [date]) : -1;
  if (amount === -1) {
    // Without a name to go on: a column of numbers with decimals that is not the date.
    const numeric = Array.from({ length: width }, (_, i) => i).filter(
      (i) =>
        i !== date &&
        share(columns[i], (v) => /[.,]\d{2}$/.test(v) && parseBankAmount(v, digits) !== null) >=
          0.8,
    );
    // The running balance is such a column too; the column that moves it is the amount.
    amount = amountBesideBalance(body, numeric, digits) ?? numeric[0] ?? -1;
  }

  // Without a name, a column counts only when it has both money out and money
  // in: a column of only "C" (Cleared) says nothing about the amount.
  if (indicator === -1 && amountIn === -1) {
    indicator = columns.findIndex(
      (values, i) =>
        i !== date &&
        i !== amount &&
        isIndicator(values) &&
        values.some(isOut) &&
        values.some(isIn),
    );
  }

  const taken = [date, amount, amountIn, indicator];
  const payee = hasHeader ? findByName(first, NAMES.payee, taken) : -1;
  const note = hasHeader ? findByName(first, NAMES.note, [...taken, payee]) : -1;

  return {
    hasHeader,
    date,
    dateOrder: detectDateOrder(date === -1 ? [] : columns[date], monthFirst),
    amount,
    amountIn: amountIn === -1 ? null : amountIn,
    indicator: indicator === -1 ? null : indicator,
    payee: payee === -1 ? null : payee,
    note: note === -1 ? null : note,
    invert: false,
  };
}

/** True when the file's dates read equally well day first and month first, so the order was a guess. */
export function isDateOrderGuess(rows: string[][], mapping: Mapping): boolean {
  if (mapping.date < 0) return false;
  const values = rows
    .slice(mapping.hasHeader ? 1 : 0, 200)
    .map((row) => row[mapping.date] ?? "")
    .filter((value) => value !== "");
  return isDateOrderAmbiguous(values);
}

/** Identifies a file layout, so a saved mapping is only reused on the same layout. */
export function layoutSignature(rows: string[][], mapping: Pick<Mapping, "hasHeader">): string {
  const first = rows[0] ?? [];
  return mapping.hasHeader ? first.map(normalise).join("|") : `no-header:${first.length}`;
}

/**
 * The amount of a row, null when unreadable. With separate columns for money
 * out and in, whichever is filled counts, whatever its sign; both filled is
 * money in minus money out.
 */
function readAmount(row: string[], mapping: Mapping, digits: number): number | null {
  const first = row[mapping.amount] ?? "";
  if (mapping.amountIn == null) return parseBankAmount(first, digits);
  const second = row[mapping.amountIn] ?? "";
  if (first === "" && second === "") return null;
  const out = first === "" ? 0 : parseBankAmount(first, digits);
  const into = second === "" ? 0 : parseBankAmount(second, digits);
  return out === null || into === null ? null : Math.abs(into) - Math.abs(out);
}

/** Turns the file's rows into transactions using the mapping. Rows that cannot be read are listed, not guessed at. */
export function applyMapping(
  rows: string[][],
  mapping: Mapping,
  digits: number,
): { rows: ParsedRow[]; skipped: SkippedRow[] } {
  const parsed: ParsedRow[] = [];
  const skipped: SkippedRow[] = [];
  const text = (row: string[], index: number | null) =>
    index === null || index < 0 ? null : (row[index] ?? "").replace(/\s+/g, " ").trim() || null;

  rows.forEach((row, i) => {
    if (mapping.hasHeader && i === 0) return;
    const line = i + 1;

    const date = parseBankDate(row[mapping.date] ?? "", mapping.dateOrder);
    if (!date) return void skipped.push({ line, reason: "No readable date" });

    let amount = readAmount(row, mapping, digits);
    if (amount === null) return void skipped.push({ line, reason: "No readable amount" });
    if (amount === 0) return void skipped.push({ line, reason: "Amount is zero" });

    if (mapping.amountIn == null && mapping.indicator !== null) {
      const flag = (row[mapping.indicator] ?? "").toLowerCase();
      if (OUT.has(flag)) amount = -Math.abs(amount);
      else if (IN.has(flag)) amount = Math.abs(amount);
      else return void skipped.push({ line, reason: "Unclear if money in or out" });
    }
    if (mapping.invert) amount = -amount;

    parsed.push({
      date,
      amount,
      payee: text(row, mapping.payee),
      note: text(row, mapping.note),
      raw: row.join("\t"),
    });
  });

  return { rows: parsed, skipped };
}

/**
 * A mapping as it is stored with an account, together with the layout of the
 * file it was made for. It is only reused on a file with the same layout.
 */
export function serializeMapping(rows: string[][], mapping: Mapping): string {
  return JSON.stringify({ signature: layoutSignature(rows, mapping), mapping });
}

/** The stored mapping, when there is a valid one and `rows` has the layout it was made for. */
export function readSavedMapping(stored: string | null, rows: string[][]): Mapping | null {
  if (!stored) return null;
  try {
    const { signature, mapping } = JSON.parse(stored) as { signature?: unknown; mapping?: unknown };
    return isMapping(mapping) && signature === layoutSignature(rows, mapping) ? mapping : null;
  } catch {
    return null;
  }
}
