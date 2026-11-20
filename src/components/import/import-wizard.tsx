"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { checkImportAction, importTransactionsAction, undoImportAction } from "@/app/actions";
import type { ImportAccount } from "@/db/transactions";
import { formatDate } from "@/lib/dates";
import {
  decodeText,
  delimiterLabels,
  delimiters,
  detectDelimiter,
  parseCsv,
  type Delimiter,
} from "@/lib/import/csv";
import { dateOrderLabels, isMonthFirstLocale, type DateOrder } from "@/lib/import/dates";
import { MAX_CELL_LENGTH, MAX_COLUMNS, MAX_FILE_BYTES, MAX_ROWS } from "@/lib/import/limits";
import {
  applyMapping,
  columnCount,
  detectMapping,
  isDateOrderGuess,
  readSavedMapping,
  type Mapping,
} from "@/lib/import/mapping";
import { formatAmount, formatMoney, minorUnitDigits } from "@/lib/money";
import {
  ErrorText,
  Field,
  field as fieldBase,
  primaryButton as buttonBase,
  quietButton,
} from "../form";
import { CheckIcon, UploadIcon } from "../icons";
import { useSave } from "../use-save";
import { VirtualList } from "./virtual-list";

type Props = { accounts: ImportAccount[]; currency: string; locale: string };
/** A chosen file: its text, which is what gets sent, and its rows, for the preview. */
type LoadedFile = { name: string; text: string; delimiter: Delimiter; rows: string[][] };
type Done = { imported: number; duplicates: number; batch: string; account: string };

/** The account of the last import in this browser, where the next file is most likely going. */
const LAST_ACCOUNT_KEY = "larchbudget.import.account";

/** Wait for this long after the last change before asking the server what is new. */
const CHECK_DELAY_MS = 300;

/** The rows of a bank file, or what is wrong with it. */
function readRows(text: string, delimiter: Delimiter): { rows: string[][] } | { problem: string } {
  const rows = parseCsv(text, delimiter);
  if (rows.length === 0) return { problem: "This file is empty." };
  if (rows.length > MAX_ROWS) {
    return { problem: "This file has too many rows. Export a shorter period from your bank." };
  }
  const oversized = rows.some(
    (row) => row.length > MAX_COLUMNS || row.some((cell) => cell.length > MAX_CELL_LENGTH),
  );
  if (oversized) {
    return { problem: "This does not look like a bank export: its rows are too wide or too long." };
  }
  return { rows };
}

/** The account of the last import, or null; storage may be unavailable (private windows). */
function lastAccount(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function rememberAccount(id: number) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, String(id));
  } catch {
    // Remembering is a convenience only.
  }
}

const field = `${fieldBase} px-2.5`;
const primaryButton = `${buttonBase} px-4 py-2.5 disabled:opacity-50`;

/**
 * Imports a bank's CSV file in three steps: choose the file, check how its
 * columns were read (with a preview), then import. The preview is worked out
 * here in the browser. The file is sent to the server as text, and the server
 * reads the same file with the same code and the same mapping, so what was
 * shown is what gets imported. Before importing, the server also says which
 * rows the account has already, and these are shown as skipped.
 */
export function ImportWizard({ accounts, currency, locale }: Props) {
  const digits = minorUnitDigits(currency);
  const input = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(accounts[0].id);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [fromLastTime, setFromLastTime] = useState(false);
  // Whether the person changed a column or a checkbox, or the account, for this
  // file: changing the account then must not throw those choices away.
  const [edited, setEdited] = useState(false);
  const [orderChosen, setOrderChosen] = useState(false);
  const [accountPicked, setAccountPicked] = useState(false);
  const [answer, setAnswer] = useState<{
    result: object;
    accountId: number;
    known: Set<number>;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [undone, setUndone] = useState<number | null>(null);
  const { error, setError, pending, save } = useSave();
  const check = useSave();

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];

  function chooseMapping(rows: string[][], forAccount: ImportAccount) {
    const saved = readSavedMapping(forAccount.importMapping, rows);
    setMapping(saved ?? detectMapping(rows, digits, isMonthFirstLocale(locale)));
    setFromLastTime(saved !== null);
  }

  async function load(chosen: File | undefined) {
    if (!chosen) return;
    // Emptied so that choosing the same file again, after it was refused and
    // exported anew, is noticed by the browser.
    if (input.current) input.current.value = "";
    setError(null);
    if (chosen.size > MAX_FILE_BYTES) {
      return setError("This file is too large. Export a shorter period from your bank.");
    }
    const text = decodeText(await chosen.arrayBuffer());
    if (text.includes(String.fromCharCode(0))) {
      return setError("This is not a CSV file. Choose CSV when you download from your bank.");
    }
    const delimiter = detectDelimiter(text);
    const read = readRows(text, delimiter);
    if ("problem" in read) return setError(read.problem);
    const { rows } = read;
    setFile({ name: chosen.name, text, delimiter, rows });
    setEdited(false);
    setOrderChosen(false);
    const into = accountFor(rows);
    setAccountId(into.id);
    chooseMapping(rows, into);
  }

  /** For a file where the guessed separator is wrong. The columns are found anew. */
  function changeDelimiter(delimiter: Delimiter) {
    if (!file) return;
    const read = readRows(file.text, delimiter);
    if ("problem" in read) return setError(read.problem);
    setError(null);
    setFile({ ...file, delimiter, rows: read.rows });
    setEdited(false);
    setOrderChosen(false);
    chooseMapping(read.rows, account);
  }

  /**
   * The account a file most likely belongs to: the one account whose saved
   * settings fit the file, else the one of the last import. A choice made by
   * hand stays.
   */
  function accountFor(rows: string[][]): ImportAccount {
    if (accountPicked) return account;
    const fitting = accounts.filter((a) => readSavedMapping(a.importMapping, rows) !== null);
    if (fitting.length === 1) return fitting[0];
    return accounts.find((a) => String(a.id) === lastAccount()) ?? account;
  }

  function reset() {
    setFile(null);
    setMapping(null);
    setError(null);
    setDone(null);
    setUndone(null);
    setAccountPicked(false);
    if (input.current) input.current.value = "";
  }

  // Next.js keeps a visited page mounted while it is hidden. A finished import
  // must not still be on screen, with its Undo link, when the page is opened
  // again later, so start over whenever the page is left after an import.
  const finished = useRef(false);
  const latestReset = useRef(reset);
  useLayoutEffect(() => {
    latestReset.current = reset;
  });
  useLayoutEffect(() => {
    return () => {
      if (finished.current) {
        finished.current = false;
        latestReset.current();
      }
    };
  }, []);

  const ready = mapping !== null && mapping.date >= 0 && mapping.amount >= 0;
  const result = useMemo(
    () => (file && mapping && ready ? applyMapping(file.rows, mapping, digits) : null),
    [file, mapping, ready, digits],
  );

  // Asked of the server a moment after the last change. An answer counts only
  // while it is for the rows and the account on screen now.
  const latest = useRef<{ result: object; accountId: number } | null>(null);
  const saveCheck = useRef(check.save);
  useLayoutEffect(() => {
    saveCheck.current = check.save;
  });
  useEffect(() => {
    if (!file || !mapping || !result) return;
    const timer = setTimeout(() => {
      latest.current = { result, accountId };
      saveCheck.current(
        () =>
          checkImportAction({
            accountId,
            text: file.text,
            delimiter: file.delimiter,
            mapping,
          }),
        (response) => {
          if (latest.current?.result !== result || latest.current.accountId !== accountId) return;
          setAnswer({ result, accountId, known: new Set(response.known) });
        },
      );
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [file, mapping, result, accountId]);

  const known = answer?.result === result && answer?.accountId === accountId ? answer.known : null;
  const skippedBefore = known?.size ?? 0;
  const count = (result?.rows.length ?? 0) - skippedBefore;

  const summary = useMemo(() => {
    const fresh = result?.rows.filter((_, i) => !known?.has(i)) ?? [];
    if (fresh.length === 0) return null;
    const dates = fresh.map((row) => row.date).sort();
    return {
      from: dates[0],
      to: dates[dates.length - 1],
      moneyIn: fresh.reduce((sum, row) => sum + Math.max(0, row.amount), 0),
      moneyOut: fresh.reduce((sum, row) => sum + Math.max(0, -row.amount), 0),
    };
  }, [result, known]);

  function runImport() {
    if (!file || !mapping || !result) return;
    // The server reads the file itself, with the same mapping as the preview.
    save(
      () =>
        importTransactionsAction({
          accountId,
          text: file.text,
          delimiter: file.delimiter,
          mapping,
        }),
      (response) => {
        finished.current = true;
        rememberAccount(accountId);
        setDone({ ...response, account: account.name });
      },
    );
  }

  function undo() {
    if (!done) return;
    save(
      () => undoImportAction(done.batch),
      (response) => setUndone(response.removed),
    );
  }

  // ---- Step 3: done -------------------------------------------------------
  if (done) {
    return (
      <div className="max-w-2xl">
        {undone !== null ? (
          <h2 className="text-lg font-semibold">
            Import undone. {undone} {undone === 1 ? "transaction was" : "transactions were"}{" "}
            removed.
          </h2>
        ) : done.imported === 0 ? (
          <>
            <h2 className="text-lg font-semibold">Nothing new to import.</h2>
            <p className="mt-1 text-muted">
              All {done.duplicates} transactions in this file were already in LarchBudget.
            </p>
          </>
        ) : (
          <>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CheckIcon className="text-brand" width={20} height={20} strokeWidth={2.4} />
              Imported {done.imported} {done.imported === 1 ? "transaction" : "transactions"} into{" "}
              {done.account}.
            </h2>
            {done.duplicates > 0 && (
              <p className="mt-1 text-muted">
                {done.duplicates} {done.duplicates === 1 ? "was" : "were"} already in LarchBudget
                and {done.duplicates === 1 ? "was" : "were"} skipped.
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex items-center gap-3">
          {undone === null && done.imported > 0 && (
            <Link href="/transactions" className={`${buttonBase} px-4 py-2.5`}>
              Sort them now
            </Link>
          )}
          <button type="button" onClick={reset} className={quietButton}>
            Import another file
          </button>
          {undone === null && done.imported > 0 && (
            <button
              type="button"
              onClick={undo}
              disabled={pending}
              className="ml-2 font-medium text-muted underline hover:text-ink disabled:opacity-50"
            >
              {pending ? "Undoing…" : "Undo this import"}
            </button>
          )}
        </div>
        <ErrorText error={error} className="mt-4" />
      </div>
    );
  }

  const accountPicker = (
    <Field label="Into account">
      <select
        value={accountId}
        onChange={(e) => {
          const next = accounts.find((a) => a.id === Number(e.target.value)) ?? accounts[0];
          setAccountId(next.id);
          setAccountPicked(true);
          if (file && !edited) chooseMapping(file.rows, next);
        }}
        className={field}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );

  // ---- Step 1: choose a file ----------------------------------------------
  if (!file || !mapping) {
    return (
      <div className="max-w-2xl">
        <div className="w-64">{accountPicker}</div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void load(e.dataTransfer.files[0]);
          }}
          className={`mt-5 flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed px-6 py-12 text-center transition-colors ${
            dragging ? "border-brand bg-ok-track" : "border-[#c3c5cb]"
          }`}
        >
          <UploadIcon width={26} height={26} className="text-muted" />
          <p className="text-muted">Drop your bank&apos;s CSV file here, or</p>
          <button type="button" onClick={() => input.current?.click()} className={primaryButton}>
            Choose a file
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            aria-label="Bank file"
            className="sr-only"
            onChange={(e) => void load(e.target.files?.[0])}
          />
        </div>
        <ErrorText error={error} className="mt-4" />
      </div>
    );
  }

  // ---- Step 2: check the columns ------------------------------------------
  const width = columnCount(file.rows);
  const sample = file.rows[mapping.hasHeader ? 1 : 0] ?? [];
  const columnLabel = (i: number) => {
    const name = mapping.hasHeader ? file.rows[0][i] : "";
    const example = (sample[i] ?? "").slice(0, 22);
    return `${name || `Column ${i + 1}`}${example ? `  ·  ${example}` : ""}`;
  };
  const set = (change: Partial<Mapping>) => {
    setMapping({ ...mapping, ...change });
    setFromLastTime(false);
    setEdited(true);
  };
  const orderGuessed = !fromLastTime && !orderChosen && isDateOrderGuess(file.rows, mapping);

  const columnSelect = (
    label: string,
    value: number | null,
    onChange: (column: number) => void,
    optional: boolean,
  ) => (
    <Field label={label}>
      <select
        value={value ?? -1}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-invalid={!optional && (value === null || value < 0) ? true : undefined}
        className={`${field} ${!optional && (value === null || value < 0) ? "border-bad" : ""}`}
      >
        <option value={-1}>{optional ? "None" : "Choose a column…"}</option>
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={i}>
            {columnLabel(i)}
          </option>
        ))}
      </select>
    </Field>
  );

  const reasons = new Map<string, number>();
  for (const skipped of result?.skipped ?? []) {
    reasons.set(skipped.reason, (reasons.get(skipped.reason) ?? 0) + 1);
  }
  const total = result?.rows.length ?? 0;
  const plural = (n: number) => (n === 1 ? "transaction" : "transactions");
  // Said only once the server has told which rows are there already.
  const newWord = skippedBefore > 0 ? "new " : "";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{file.name}</h2>
          <p className="text-sm text-muted">
            {fromLastTime
              ? "Read with the settings from your last import into this account."
              : "Check that the columns below were recognised correctly."}
          </p>
        </div>
        <button type="button" onClick={reset} className={quietButton}>
          Choose another file
        </button>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-x-4 gap-y-4">
        {accountPicker}
        {columnSelect("Date", mapping.date, (date) => set({ date }), false)}
        <div>
          <Field label="Date is written as">
            <select
              value={mapping.dateOrder}
              onChange={(e) => {
                setOrderChosen(true);
                set({ dateOrder: e.target.value as DateOrder });
              }}
              aria-describedby={orderGuessed ? "date-order-guess" : undefined}
              className={field}
            >
              {Object.entries(dateOrderLabels).map(([order, label]) => (
                <option key={order} value={order}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {orderGuessed && (
            <p id="date-order-guess" className="mt-1 text-sm text-muted">
              Could be either; check this.
            </p>
          )}
        </div>
        {columnSelect("Amount", mapping.amount, (amount) => set({ amount }), false)}
        {columnSelect(
          "Money in (if it has its own column)",
          mapping.amountIn ?? null,
          (column) => set({ amountIn: column < 0 ? null : column }),
          true,
        )}
        {columnSelect(
          "Out or in (Af/Bij, Debit/Credit)",
          mapping.indicator,
          (column) => set({ indicator: column < 0 ? null : column }),
          true,
        )}
        {columnSelect(
          "Payee",
          mapping.payee,
          (column) => set({ payee: column < 0 ? null : column }),
          true,
        )}
        {columnSelect(
          "Note",
          mapping.note,
          (column) => set({ note: column < 0 ? null : column }),
          true,
        )}
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            Separator
            <select
              value={file.delimiter}
              onChange={(e) => changeDelimiter(e.target.value as Delimiter)}
              className={`${field} w-auto py-1`}
            >
              {delimiters.map((delimiter) => (
                <option key={delimiter} value={delimiter}>
                  {delimiterLabels[delimiter]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mapping.hasHeader}
              onChange={(e) => set({ hasHeader: e.target.checked })}
            />
            First row holds column names
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mapping.invert}
              onChange={(e) => set({ invert: e.target.checked })}
            />
            Spending is shown as positive numbers
          </label>
        </div>
      </div>

      {!ready ? (
        <p className="mt-6 rounded-xl bg-bad-track px-4 py-3 text-bad-ink">
          Choose which columns hold the date and the amount.
        </p>
      ) : (
        <>
          <div className="mt-6 rounded-xl bg-ok-track px-4 py-3">
            {summary ? (
              <p>
                <b className="font-semibold">
                  {count} {newWord}
                  {plural(count)}
                </b>
                {" · "}
                {formatDate(summary.from, locale)} to {formatDate(summary.to, locale)}
                {" · "}
                {formatMoney(summary.moneyIn, currency, locale)} in
                {" · "}
                {formatMoney(summary.moneyOut, currency, locale)} out
              </p>
            ) : total > 0 ? (
              <p>
                <b className="font-semibold">Nothing new to import.</b> All {total} {plural(total)}{" "}
                in this file were imported before.
              </p>
            ) : (
              <p>No transactions could be read with these columns.</p>
            )}
            {skippedBefore > 0 && count > 0 && (
              <p className="mt-1 text-sm text-muted">
                {skippedBefore} {skippedBefore === 1 ? "was" : "were"} imported before and will be
                skipped.
              </p>
            )}
            {reasons.size > 0 && (
              <p className="mt-1 text-sm text-muted">
                Skipped:{" "}
                {[...reasons].map(([reason, n]) => `${n} × ${reason.toLowerCase()}`).join(", ")}.
              </p>
            )}
          </div>

          {total > 0 && (
            <>
              <p className="mt-4 pb-2 text-sm text-muted">As they will be imported</p>
              <VirtualList
                label="Transactions in this file"
                columns={[
                  { name: "Date", width: "8rem" },
                  { name: "Payee", width: "minmax(0, 1fr)" },
                  { name: "Note", width: "minmax(0, 1fr)" },
                  { name: "Amount", width: "8rem", align: "right" },
                ]}
                count={total}
                isMuted={(i) => known?.has(i) ?? false}
                renderRow={(i) => {
                  const row = result!.rows[i];
                  return (
                    <>
                      <div role="cell" className="whitespace-nowrap text-muted tabular-nums">
                        {formatDate(row.date, locale)}
                      </div>
                      <div role="cell" className="flex min-w-0 items-center gap-2 pr-4">
                        <span className="truncate font-medium">{row.payee ?? "–"}</span>
                        {known?.has(i) && (
                          <span className="shrink-0 rounded-full border border-line px-2 text-xs">
                            Imported before
                          </span>
                        )}
                      </div>
                      <div role="cell" className="truncate pr-4 text-muted">
                        {row.note ?? ""}
                      </div>
                      <div role="cell" className="text-right font-semibold tabular-nums">
                        {row.amount > 0 ? "+" : ""}
                        {formatAmount(row.amount, currency, locale)}
                      </div>
                    </>
                  );
                }}
              />
            </>
          )}

          {result!.skipped.length > 0 && (
            <>
              <p className="mt-4 pb-2 text-sm text-muted">Rows that will not be imported</p>
              <VirtualList
                label="Rows that cannot be read"
                columns={[
                  { name: "Row", width: "5rem" },
                  { name: "Reason", width: "14rem" },
                  { name: "In the file", width: "minmax(0, 1fr)" },
                ]}
                count={result!.skipped.length}
                renderRow={(i) => {
                  const skipped = result!.skipped[i];
                  return (
                    <>
                      <div role="cell" className="text-muted tabular-nums">
                        {skipped.line}
                      </div>
                      <div role="cell" className="font-medium">
                        {skipped.reason}
                      </div>
                      <div role="cell" className="truncate text-muted">
                        {file.rows[skipped.line - 1].join(" · ")}
                      </div>
                    </>
                  );
                }}
              />
            </>
          )}
        </>
      )}

      <div className="sticky bottom-0 z-20 mt-6 flex items-center gap-4 border-t border-line bg-surface py-4">
        <button
          type="button"
          onClick={runImport}
          disabled={pending || count === 0}
          className={primaryButton}
        >
          {pending
            ? "Importing…"
            : total > 0 && count === 0
              ? "Nothing new to import"
              : `Import ${count} ${newWord}${plural(count)} into ${account.name}`}
        </button>
        <ErrorText error={error} />
      </div>
    </div>
  );
}
