"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { importTransactionsAction, undoImportAction } from "@/app/actions";
import type { ImportAccount } from "@/db/transactions";
import { formatDate } from "@/lib/dates";
import { decodeText, parseCsv } from "@/lib/import/csv";
import { dateOrderLabels, type DateOrder } from "@/lib/import/dates";
import { MAX_CELL_LENGTH, MAX_COLUMNS, MAX_FILE_BYTES, MAX_ROWS } from "@/lib/import/limits";
import {
  applyMapping,
  columnCount,
  detectMapping,
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

type Props = { accounts: ImportAccount[]; currency: string; locale: string };
/** A chosen file: its text, which is what gets sent, and its rows, for the preview. */
type LoadedFile = { name: string; text: string; rows: string[][] };
type Done = { imported: number; duplicates: number; batch: string; account: string };

const PREVIEW_ROWS = 8;

const field = `${fieldBase} px-2.5`;
const primaryButton = `${buttonBase} px-4 py-2.5 disabled:opacity-50`;

/**
 * Imports a bank's CSV file in three steps: choose the file, check how its
 * columns were read (with a preview), then import. The preview is worked out
 * here in the browser; on import the server reads the same rows with the
 * same mapping, so what was shown is what gets imported.
 */
export function ImportWizard({ accounts, currency, locale }: Props) {
  const digits = minorUnitDigits(currency);
  const input = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(accounts[0].id);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [fromLastTime, setFromLastTime] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [undone, setUndone] = useState<number | null>(null);
  const { error, setError, pending, save } = useSave();

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];

  function chooseMapping(rows: string[][], forAccount: ImportAccount) {
    const saved = readSavedMapping(forAccount.importMapping, rows);
    setMapping(saved ?? detectMapping(rows, digits));
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
    const rows = parseCsv(text);
    if (rows.length === 0) return setError("This file is empty.");
    if (rows.length > MAX_ROWS) {
      return setError("This file has too many rows. Export a shorter period from your bank.");
    }
    const oversized = rows.some(
      (row) => row.length > MAX_COLUMNS || row.some((cell) => cell.length > MAX_CELL_LENGTH),
    );
    if (oversized) {
      return setError("This does not look like a bank export: its rows are too wide or too long.");
    }
    setFile({ name: chosen.name, text, rows });
    chooseMapping(rows, account);
  }

  function reset() {
    setFile(null);
    setMapping(null);
    setError(null);
    setDone(null);
    setUndone(null);
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

  const summary = useMemo(() => {
    if (!result || result.rows.length === 0) return null;
    const dates = result.rows.map((row) => row.date).sort();
    return {
      from: dates[0],
      to: dates[dates.length - 1],
      moneyIn: result.rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0),
      moneyOut: result.rows.reduce((sum, row) => sum + Math.max(0, -row.amount), 0),
    };
  }, [result]);

  function runImport() {
    if (!file || !mapping || !result) return;
    // The server reads the file itself, with the same mapping as the preview.
    save(
      () => importTransactionsAction({ accountId, text: file.text, mapping }),
      (response) => {
        finished.current = true;
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
          if (file) chooseMapping(file.rows, next);
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
  };

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
  const count = result?.rows.length ?? 0;

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
        <Field label="Date is written as">
          <select
            value={mapping.dateOrder}
            onChange={(e) => set({ dateOrder: e.target.value as DateOrder })}
            className={field}
          >
            {Object.entries(dateOrderLabels).map(([order, label]) => (
              <option key={order} value={order}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {columnSelect("Amount", mapping.amount, (amount) => set({ amount }), false)}
        {columnSelect(
          "Money out or in",
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
            Spending is listed as positive
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
                  {count} {count === 1 ? "transaction" : "transactions"}
                </b>
                {" · "}
                {formatDate(summary.from, locale)} to {formatDate(summary.to, locale)}
                {" · "}
                {formatMoney(summary.moneyIn, currency, locale)} in
                {" · "}
                {formatMoney(summary.moneyOut, currency, locale)} out
              </p>
            ) : (
              <p>No transactions could be read with these columns.</p>
            )}
            {reasons.size > 0 && (
              <p className="mt-1 text-sm text-muted">
                Skipped:{" "}
                {[...reasons].map(([reason, n]) => `${n} × ${reason.toLowerCase()}`).join(", ")}
                {" (rows "}
                {result!.skipped
                  .slice(0, 5)
                  .map((skipped) => skipped.line)
                  .join(", ")}
                {result!.skipped.length > 5 ? ", …" : ""}
                {")."}
              </p>
            )}
          </div>

          {count > 0 && (
            <table className="mt-4 w-full border-collapse">
              <caption className="pb-2 text-left text-sm text-muted">
                {count > PREVIEW_ROWS
                  ? `The first ${PREVIEW_ROWS} as they will be imported`
                  : "As they will be imported"}
              </caption>
              <thead>
                <tr className="border-y border-line text-[12.5px] text-muted">
                  <th scope="col" className="h-[34px] w-32 pl-3.5 text-left font-medium">
                    Date
                  </th>
                  <th scope="col" className="text-left font-medium">
                    Payee
                  </th>
                  <th scope="col" className="text-left font-medium">
                    Note
                  </th>
                  <th scope="col" className="w-32 pr-3.5 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {result!.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                  <tr key={i} className="data-row">
                    <td className="h-[38px] pl-3.5 whitespace-nowrap text-muted tabular-nums">
                      {formatDate(row.date, locale)}
                    </td>
                    <td className="max-w-0 truncate pr-4 font-medium">{row.payee ?? "–"}</td>
                    <td className="max-w-0 truncate pr-4 text-muted">{row.note ?? ""}</td>
                    <td className="pr-3.5 text-right font-semibold whitespace-nowrap tabular-nums">
                      {row.amount > 0 ? "+" : ""}
                      {formatAmount(row.amount, currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={runImport}
          disabled={pending || count === 0}
          className={primaryButton}
        >
          {pending
            ? "Importing…"
            : `Import ${count} ${count === 1 ? "transaction" : "transactions"} into ${account.name}`}
        </button>
        <ErrorText error={error} />
      </div>
    </div>
  );
}
