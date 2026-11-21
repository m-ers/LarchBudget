"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { checkImportAction, importTransactionsAction, undoImportAction } from "@/app/actions";
import type { ImportAccount, ImportOutcome } from "@/db/transactions";
import { useT } from "@/i18n/client";
import { formatDate } from "@/lib/dates";
import {
  decodeText,
  delimiterIds,
  delimiters,
  detectDelimiter,
  parseCsv,
  type Delimiter,
} from "@/lib/import/csv";
import { dateOrders, isMonthFirstLocale, type DateOrder } from "@/lib/import/dates";
import { MAX_CELL_LENGTH, MAX_COLUMNS, MAX_FILE_BYTES, MAX_ROWS } from "@/lib/import/limits";
import {
  applyMapping,
  columnCount,
  detectMapping,
  isDateOrderGuess,
  readSavedMapping,
  savedDelimiter,
  type Mapping,
  type SkipReason,
} from "@/lib/import/mapping";
import { richText } from "@/i18n/rich";
import { formatAmount, formatMoney, minorUnitDigits } from "@/lib/money";
import {
  ErrorText,
  Field,
  primaryButton as buttonBase,
  quietButton,
  selectField as selectBase,
  smallSelectField,
} from "../form";
import { CheckIcon, UploadIcon } from "../icons";
import { useSave } from "../use-save";
import { VirtualList } from "./virtual-list";

type Props = { accounts: ImportAccount[]; currency: string; locale: string };
/** A chosen file: its text, which is what gets sent, and its rows, for the preview. */
type LoadedFile = { name: string; text: string; delimiter: Delimiter; rows: string[][] };
type Done = ImportOutcome & { batch: string; account: string };

/** Draws the `<b>` parts of the summary texts. */
const bold = { b: (chunks: ReactNode) => <b className="font-semibold">{chunks}</b> };

/** The account of the last import in this browser, where the next file is most likely going. */
const LAST_ACCOUNT_KEY = "larchbudget.import.account";

/** Wait for this long after the last change before asking the server what is new. */
const CHECK_DELAY_MS = 300;

/** The rows of a bank file, or what is wrong with it. */
function readRows(
  text: string,
  delimiter: Delimiter,
): { rows: string[][] } | { problem: "empty" | "tooManyRows" | "tooWide" } {
  const rows = parseCsv(text, delimiter);
  if (rows.length === 0) return { problem: "empty" };
  if (rows.length > MAX_ROWS) return { problem: "tooManyRows" };
  const oversized = rows.some(
    (row) => row.length > MAX_COLUMNS || row.some((cell) => cell.length > MAX_CELL_LENGTH),
  );
  if (oversized) {
    return { problem: "tooWide" };
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

const selectField = `${selectBase} px-2.5`;
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
  const t = useT();
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
      return setError(t("import.problems.tooLarge"));
    }
    const text = decodeText(await chosen.arrayBuffer());
    if (text.includes(String.fromCharCode(0))) {
      return setError(t("import.problems.notCsv"));
    }
    let delimiter = detectDelimiter(text);
    let read = readRows(text, delimiter);
    // When the guess leads to no saved settings, try the separators that
    // earlier files were read with: one corrected by hand stays corrected.
    if (!fitsSavedSettings(read)) {
      for (const remembered of new Set(accounts.map((a) => savedDelimiter(a.importMapping)))) {
        if (remembered === null || remembered === delimiter) continue;
        const again = readRows(text, remembered);
        if (fitsSavedSettings(again)) {
          delimiter = remembered;
          read = again;
          break;
        }
      }
    }
    if ("problem" in read) return setError(t(`import.problems.${read.problem}`));
    const { rows } = read;
    setFile({ name: chosen.name, text, delimiter, rows });
    setEdited(false);
    setOrderChosen(false);
    const into = accountFor(rows);
    setAccountId(into.id);
    chooseMapping(rows, into);
  }

  /** True when some account's saved settings were made for a file laid out like this one. */
  function fitsSavedSettings(read: ReturnType<typeof readRows>) {
    return (
      !("problem" in read) &&
      accounts.some((a) => readSavedMapping(a.importMapping, read.rows) !== null)
    );
  }

  /** For a file where the guessed separator is wrong. The columns are found anew. */
  function changeDelimiter(delimiter: Delimiter) {
    if (!file) return;
    const read = readRows(file.text, delimiter);
    if ("problem" in read) return setError(t(`import.problems.${read.problem}`));
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
    const balanceValues = (d: Done) => ({
      count: d.beforeBalance,
      date: d.balanceDate ? formatDate(d.balanceDate, locale) : "",
      balance: d.startingBalance === null ? "" : formatMoney(d.startingBalance, currency, locale),
    });
    return (
      <div className="max-w-2xl">
        {undone !== null ? (
          <h2 className="text-lg font-semibold">{t("import.result.undone", { count: undone })}</h2>
        ) : done.imported === 0 ? (
          <>
            <h2 className="text-lg font-semibold">{t("import.result.nothingNew")}</h2>
            <p className="mt-1 text-muted">
              {t("import.result.allDuplicates", { count: done.duplicates })}
            </p>
          </>
        ) : (
          <>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CheckIcon className="text-brand" width={20} height={20} strokeWidth={2.4} />
              {t("import.result.imported", { count: done.imported, account: done.account })}
            </h2>
            {done.duplicates > 0 && (
              <p className="mt-1 text-muted">
                {t("import.result.duplicates", { count: done.duplicates })}
              </p>
            )}
            {done.beforeBalance > 0 &&
              done.balanceDate !== null &&
              done.startingBalance !== null && (
                <p className="mt-1 text-muted">
                  {done.beforeBalance === done.imported
                    ? t(
                        done.imported === 1
                          ? "import.result.balanceAllOne"
                          : "import.result.balanceAllMany",
                        balanceValues(done),
                      )
                    : t("import.result.balanceSome", balanceValues(done))}
                </p>
              )}
          </>
        )}

        <div className="mt-5 flex items-center gap-3">
          {undone === null && done.imported > 0 && (
            <Link href="/transactions" className={`${buttonBase} px-4 py-2.5`}>
              {t("import.result.sortNow")}
            </Link>
          )}
          <button type="button" onClick={reset} className={quietButton}>
            {t("import.result.importAnother")}
          </button>
          {undone === null && done.imported > 0 && (
            <button
              type="button"
              onClick={undo}
              disabled={pending}
              className="ml-2 font-medium text-muted underline hover:text-ink disabled:opacity-50"
            >
              {pending ? t("import.result.undoing") : t("import.result.undo")}
            </button>
          )}
        </div>
        <ErrorText error={error} className="mt-4" />
      </div>
    );
  }

  const accountPicker = (
    <Field label={t("import.choose.account")}>
      <select
        value={accountId}
        onChange={(e) => {
          const next = accounts.find((a) => a.id === Number(e.target.value)) ?? accounts[0];
          setAccountId(next.id);
          setAccountPicked(true);
          if (file && !edited) chooseMapping(file.rows, next);
        }}
        className={selectField}
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
            dragging ? "border-brand bg-ok-track" : "border-dash"
          }`}
        >
          <UploadIcon width={26} height={26} className="text-muted" />
          <p className="text-muted">{t("import.choose.dropHere")}</p>
          <button type="button" onClick={() => input.current?.click()} className={primaryButton}>
            {t("import.choose.chooseFile")}
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            aria-label={t("import.choose.fileInput")}
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
    return `${name || t("import.columns.unnamed", { number: String(i + 1) })}${example ? `  ·  ${example}` : ""}`;
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
    {
      none = t("import.columns.none"),
      tip,
      tipId,
    }: { none?: string; tip?: string; tipId?: string } = {},
  ) => {
    return (
      <Field label={label} tip={tip} tipId={tipId}>
        <select
          value={value ?? -1}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-describedby={tipId}
          aria-invalid={!optional && (value === null || value < 0) ? true : undefined}
          className={`${selectField} ${!optional && (value === null || value < 0) ? "border-bad" : ""}`}
        >
          <option value={-1}>{optional ? none : t("import.columns.chooseColumn")}</option>
          {Array.from({ length: width }, (_, i) => (
            <option key={i} value={i}>
              {columnLabel(i)}
            </option>
          ))}
        </select>
      </Field>
    );
  };

  const reasons = new Map<SkipReason, number>();
  for (const skipped of result?.skipped ?? []) {
    reasons.set(skipped.reason, (reasons.get(skipped.reason) ?? 0) + 1);
  }
  const total = result?.rows.length ?? 0;
  // "New" is said only once the server has told which rows are there already.
  const anyKnown = skippedBefore > 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{file.name}</h2>
          <p className="text-sm text-muted">
            {fromLastTime ? t("import.columns.introFromLastTime") : t("import.columns.intro")}
          </p>
        </div>
        <button type="button" onClick={reset} className={quietButton}>
          {t("import.columns.chooseAnotherFile")}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-x-4 gap-y-4">
        {accountPicker}
        {columnSelect(t("import.columns.date"), mapping.date, (date) => set({ date }), false)}
        <div>
          <Field label={t("import.columns.dateWrittenAs")}>
            <select
              value={mapping.dateOrder}
              onChange={(e) => {
                setOrderChosen(true);
                set({ dateOrder: e.target.value as DateOrder });
              }}
              aria-describedby={orderGuessed ? "date-order-guess" : undefined}
              className={selectField}
            >
              {dateOrders.map((order) => (
                <option key={order} value={order}>
                  {t(`import.dateOrders.${order}`)}
                </option>
              ))}
            </select>
          </Field>
          {orderGuessed && (
            <p id="date-order-guess" className="mt-1 text-sm text-muted">
              {t("import.columns.dateGuess")}
            </p>
          )}
        </div>
        {columnSelect(
          t("import.columns.amount"),
          mapping.amount,
          (amount) => set({ amount }),
          false,
        )}
        {columnSelect(
          t("import.columns.moneyIn"),
          mapping.amountIn ?? null,
          (column) => set({ amountIn: column < 0 ? null : column }),
          true,
          {
            none: t("import.columns.noSeparateColumn"),
            tip: t("import.columns.moneyInTip"),
            tipId: "money-in-tip",
          },
        )}
        {columnSelect(
          t("import.columns.outOrIn"),
          mapping.indicator,
          (column) => set({ indicator: column < 0 ? null : column }),
          true,
          {
            none: t("import.columns.noSeparateColumn"),
            tip: t("import.columns.outOrInTip"),
            tipId: "out-or-in-tip",
          },
        )}
        {columnSelect(
          t("import.columns.payee"),
          mapping.payee,
          (column) => set({ payee: column < 0 ? null : column }),
          true,
        )}
        {columnSelect(
          t("import.columns.note"),
          mapping.note,
          (column) => set({ note: column < 0 ? null : column }),
          true,
        )}
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            {t("import.columns.separator")}
            <select
              value={file.delimiter}
              onChange={(e) => changeDelimiter(e.target.value as Delimiter)}
              className={`${smallSelectField} px-2.5`}
            >
              {delimiters.map((delimiter) => (
                <option key={delimiter} value={delimiter}>
                  {t(`import.delimiters.${delimiterIds[delimiter]}`)}
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
            {t("import.columns.hasHeader")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mapping.invert}
              onChange={(e) => set({ invert: e.target.checked })}
            />
            {t("import.columns.invert")}
          </label>
        </div>
      </div>

      {!ready ? (
        <p className="mt-6 rounded-xl bg-bad-track px-4 py-3 text-bad-ink">
          {t("import.columns.notReady")}
        </p>
      ) : (
        <>
          <div className="mt-6 rounded-xl bg-ok-track px-4 py-3">
            {summary ? (
              <p>
                {richText(
                  t,
                  anyKnown ? "import.summary.newCount" : "import.summary.count",
                  {
                    count,
                    from: formatDate(summary.from, locale),
                    to: formatDate(summary.to, locale),
                    moneyIn: formatMoney(summary.moneyIn, currency, locale),
                    moneyOut: formatMoney(summary.moneyOut, currency, locale),
                  },
                  bold,
                )}
              </p>
            ) : total > 0 ? (
              <p>{richText(t, "import.summary.allImported", { count: total }, bold)}</p>
            ) : (
              <p>{t("import.summary.unreadable")}</p>
            )}
            {skippedBefore > 0 && count > 0 && (
              <p className="mt-1 text-sm text-muted">
                {t("import.summary.importedBefore", { count: skippedBefore })}
              </p>
            )}
            {reasons.size > 0 && (
              <p className="mt-1 text-sm text-muted">
                {t("import.summary.skipped", {
                  list: [...reasons]
                    .map(([reason, n]) =>
                      t("import.summary.skippedItem", {
                        count: n,
                        reason: t(`import.skipped.reasonsInline.${reason}`),
                      }),
                    )
                    .join(t("import.summary.skippedSeparator")),
                })}
              </p>
            )}
          </div>

          {total > 0 && (
            <>
              <p className="mt-4 pb-2 text-sm text-muted">{t("import.preview.heading")}</p>
              <VirtualList
                label={t("import.preview.label")}
                columns={[
                  { name: t("import.preview.date"), width: "8rem" },
                  { name: t("import.preview.payee"), width: "minmax(0, 1fr)" },
                  { name: t("import.preview.note"), width: "minmax(0, 1fr)" },
                  { name: t("import.preview.amount"), width: "8rem", align: "right" },
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
                            {t("import.preview.importedBefore")}
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
              <p className="mt-4 pb-2 text-sm text-muted">{t("import.skipped.heading")}</p>
              <VirtualList
                label={t("import.skipped.label")}
                columns={[
                  { name: t("import.skipped.row"), width: "5rem" },
                  { name: t("import.skipped.reason"), width: "14rem" },
                  { name: t("import.skipped.inFile"), width: "minmax(0, 1fr)" },
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
                        {t(`import.skipped.reasons.${skipped.reason}`)}
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
            ? t("import.action.importing")
            : total > 0 && count === 0
              ? t("import.action.nothingNew")
              : t(anyKnown ? "import.action.importNew" : "import.action.import", {
                  count,
                  account: account.name,
                })}
        </button>
        <ErrorText error={error} />
      </div>
    </div>
  );
}
