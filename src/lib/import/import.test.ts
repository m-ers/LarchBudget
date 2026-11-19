import { describe, expect, it } from "vitest";
import { parseBankAmount } from "./amount";
import { detectDelimiter, parseCsv } from "./csv";
import { detectDateOrder, parseBankDate } from "./dates";
import {
  applyMapping,
  detectMapping,
  isMapping,
  layoutSignature,
  readSavedMapping,
  serializeMapping,
} from "./mapping";

describe("parseCsv", () => {
  it("detects the delimiter", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter('a;b;c\n1;"2,50";3')).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2,50\t3")).toBe("\t");
    expect(detectDelimiter('"Datum";"Bedrag"\n"20261103";"12,50"')).toBe(";");
  });

  it("handles quotes, doubled quotes and line breaks inside cells", () => {
    expect(parseCsv('name,note\n"Smith, J","said ""hi"""\n"two\nlines",x')).toEqual([
      ["name", "note"],
      ["Smith, J", 'said "hi"'],
      ["two\nlines", "x"],
    ]);
  });

  it("drops empty lines, trims cells and copes with Windows line endings", () => {
    expect(parseCsv("a;b\r\n\r\n 1 ; 2 \r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseBankAmount", () => {
  it("reads both decimal styles exactly", () => {
    expect(parseBankAmount("12,50", 2)).toBe(1250);
    expect(parseBankAmount("12.50", 2)).toBe(1250);
    expect(parseBankAmount("1.234,56", 2)).toBe(123456);
    expect(parseBankAmount("1,234.56", 2)).toBe(123456);
    expect(parseBankAmount("0,29", 2)).toBe(29);
    expect(parseBankAmount("12", 2)).toBe(1200);
    expect(parseBankAmount("12,5", 2)).toBe(1250);
  });

  it("reads a lone separator before three digits as thousands", () => {
    expect(parseBankAmount("1.234", 2)).toBe(123400);
    expect(parseBankAmount("1,234", 2)).toBe(123400);
    expect(parseBankAmount("1.234.567", 2)).toBe(123456700);
    expect(parseBankAmount("1.234", 3)).toBe(1234);
  });

  it("reads every way of writing a negative", () => {
    expect(parseBankAmount("-12,50", 2)).toBe(-1250);
    expect(parseBankAmount("12,50-", 2)).toBe(-1250);
    expect(parseBankAmount("(12.50)", 2)).toBe(-1250);
    expect(parseBankAmount("+12,50", 2)).toBe(1250);
    expect(parseBankAmount("- 12,50", 2)).toBe(-1250);
  });

  it("ignores currency symbols and spaces", () => {
    expect(parseBankAmount("EUR 1 234,56", 2)).toBe(123456);
    expect(parseBankAmount("$12.50", 2)).toBe(1250);
    expect(parseBankAmount("12,50 EUR", 2)).toBe(1250);
  });

  it("accepts extra decimals only when they are zeros", () => {
    expect(parseBankAmount("12.5000", 2)).toBe(1250);
    expect(parseBankAmount("12.5678", 2)).toBeNull();
    expect(parseBankAmount("1500", 0)).toBe(1500);
  });

  it("rejects text that is not an amount", () => {
    for (const text of ["", "abc", "12a", "1e3", "--5", "NL01BANK0123456789"]) {
      expect(parseBankAmount(text, 2)).toBeNull();
    }
  });
});

describe("bank dates", () => {
  it("parses each order, with any separator and an optional time", () => {
    expect(parseBankDate("20261103", "ymd")).toBe("2026-11-03");
    expect(parseBankDate("2026-11-03", "ymd")).toBe("2026-11-03");
    expect(parseBankDate("2026-11-03 14:22:10", "ymd")).toBe("2026-11-03");
    expect(parseBankDate("03-11-2026", "dmy")).toBe("2026-11-03");
    expect(parseBankDate("3/11/2026", "dmy")).toBe("2026-11-03");
    expect(parseBankDate("03.11.26", "dmy")).toBe("2026-11-03");
    expect(parseBankDate("11/03/2026", "mdy")).toBe("2026-11-03");
  });

  it("rejects dates that do not exist or do not fit the order", () => {
    expect(parseBankDate("31-02-2026", "dmy")).toBeNull();
    expect(parseBankDate("13/25/2026", "dmy")).toBeNull();
    expect(parseBankDate("2026-11-03", "dmy")).toBeNull();
    expect(parseBankDate("03-11-2026", "ymd")).toBeNull();
    expect(parseBankDate("hello", "dmy")).toBeNull();
  });

  it("detects the order from a column of dates", () => {
    expect(detectDateOrder(["20261103", "20261104"])).toBe("ymd");
    expect(detectDateOrder(["03-11-2026", "25-11-2026"])).toBe("dmy");
    expect(detectDateOrder(["11/03/2026", "11/25/2026"])).toBe("mdy");
    // Ambiguous: day-first wins.
    expect(detectDateOrder(["03-11-2026", "04-11-2026"])).toBe("dmy");
  });
});

const ing = `"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen";"Saldo na mutatie";"Tag"
"20261103";"Fresh Market";"NL01BANK0123456789";"";"BA";"Af";"45,10";"Betaalautomaat";"Pasvolgnr: 001 03-11-2026 12:01";"1.954,90";""
"20261101";"Acme Corp";"NL01BANK0123456789";"NL02BANK0987654321";"OV";"Bij";"2.850,00";"Overschrijving";"Salary November";"2.000,00";""`;

const rabobank = `"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Omschrijving-1"
"NL01BANK0123456789","EUR","BANKNL2A","000000000000007342","2026-11-03","2026-11-03","-45,10","+1954,90","","Fresh Market","Betaalautomaat 12:01"
"NL01BANK0123456789","EUR","BANKNL2A","000000000000007343","2026-11-01","2026-11-01","+2850,00","+2000,00","NL02BANK0987654321","Acme Corp","Salary November"`;

const english = `Date,Description,Amount,Balance
11/25/2026,COFFEE SHOP,-4.50,1200.00
11/03/2026,PAYROLL,"2,850.00",1204.50`;

const noHeader = `NL01BANK0123456789\tEUR\t20261103\t2000,00\t1954,90\t20261103\t-45,10\tBEA Fresh Market
NL01BANK0123456789\tEUR\t20261101\t-850,00\t2000,00\t20261101\t2850,00\tSEPA Acme Corp Salary`;

const expected = [
  { date: "2026-11-03", amount: -4510, payee: "Fresh Market" },
  { date: "2026-11-01", amount: 285000, payee: "Acme Corp" },
];

describe("detectMapping and applyMapping", () => {
  it("reads a file with an out/in column and decimal commas (ING layout)", () => {
    const rows = parseCsv(ing);
    const mapping = detectMapping(rows, 2);
    expect(mapping).toMatchObject({
      hasHeader: true,
      date: 0,
      dateOrder: "ymd",
      amount: 6,
      indicator: 5,
      payee: 1,
      note: 8,
    });
    const result = applyMapping(rows, mapping, 2);
    expect(result.skipped).toEqual([]);
    expect(result.rows).toMatchObject(expected);
    expect(result.rows[1].note).toBe("Salary November");
  });

  it("reads a file with signed amounts and ignores the balance column (Rabobank layout)", () => {
    const rows = parseCsv(rabobank);
    const mapping = detectMapping(rows, 2);
    expect(mapping).toMatchObject({
      hasHeader: true,
      date: 4,
      dateOrder: "ymd",
      amount: 6,
      indicator: null,
      payee: 9,
      note: 10,
    });
    expect(applyMapping(rows, mapping, 2).rows).toMatchObject(expected);
  });

  it("reads month-first dates and thousands separators", () => {
    const rows = parseCsv(english);
    const mapping = detectMapping(rows, 2);
    expect(mapping).toMatchObject({
      hasHeader: true,
      date: 0,
      dateOrder: "mdy",
      amount: 2,
      payee: 1,
    });
    expect(applyMapping(rows, mapping, 2).rows).toMatchObject([
      { date: "2026-11-25", amount: -450, payee: "COFFEE SHOP" },
      { date: "2026-11-03", amount: 285000, payee: "PAYROLL" },
    ]);
  });

  it("finds the date in a file without a header and lets the rest be chosen", () => {
    const rows = parseCsv(noHeader);
    const mapping = detectMapping(rows, 2);
    expect(mapping).toMatchObject({ hasHeader: false, date: 2, dateOrder: "ymd" });
    // The first column with decimals is a balance; the user picks the right one.
    const result = applyMapping(rows, { ...mapping, amount: 6, payee: 7 }, 2);
    expect(result.rows).toMatchObject([
      { date: "2026-11-03", amount: -4510, payee: "BEA Fresh Market" },
      { date: "2026-11-01", amount: 285000, payee: "SEPA Acme Corp Salary" },
    ]);
  });

  it("can flip the sign for exports that list spending as positive", () => {
    const rows = parseCsv("Date,Merchant,Amount\n2026-11-03,Shop,12.50");
    const mapping = { ...detectMapping(rows, 2), invert: true };
    expect(applyMapping(rows, mapping, 2).rows[0].amount).toBe(-1250);
  });

  it("lists rows it cannot read instead of guessing", () => {
    const rows = parseCsv(
      "Date,Name,Amount\n2026-11-03,Shop,12.50\nTotal,,\n2026-11-04,Fee,0.00\n2026-13-45,Bad,1.00",
    );
    const result = applyMapping(rows, detectMapping(rows, 2), 2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].raw).toBe("2026-11-03\tShop\t12.50");
    expect(result.skipped).toEqual([
      { line: 3, reason: "No readable date" },
      { line: 4, reason: "Amount is zero" },
      { line: 5, reason: "No readable date" },
    ]);
  });

  it("gives the same signature only to files with the same columns", () => {
    const a = parseCsv(ing);
    const b = parseCsv(rabobank);
    expect(layoutSignature(a, { hasHeader: true })).toBe(
      layoutSignature(parseCsv(ing), { hasHeader: true }),
    );
    expect(layoutSignature(a, { hasHeader: true })).not.toBe(
      layoutSignature(b, { hasHeader: true }),
    );
  });
});

describe("the identity of a row", () => {
  it("is the whole line, whichever columns were chosen", () => {
    const rows = parseCsv(rabobank);
    const detected = detectMapping(rows, 2);
    const withoutNote = applyMapping(rows, { ...detected, note: null, payee: 2 }, 2);
    const withNote = applyMapping(rows, detected, 2);
    expect(withoutNote.rows.map((r) => r.raw)).toEqual(withNote.rows.map((r) => r.raw));
    expect(withNote.rows[0].raw).toContain("000000000000007342");
  });
});

describe("saved mappings", () => {
  const rows = parseCsv(ing);
  const mapping = detectMapping(rows, 2);

  it("come back for a file with the same columns", () => {
    expect(readSavedMapping(serializeMapping(rows, mapping), rows)).toEqual(mapping);
  });

  it("are not used for another layout, or when missing or damaged", () => {
    const stored = serializeMapping(rows, mapping);
    expect(readSavedMapping(stored, parseCsv(rabobank))).toBeNull();
    expect(readSavedMapping(null, rows)).toBeNull();
    expect(readSavedMapping("not json", rows)).toBeNull();
    expect(
      readSavedMapping(stored.replace('"dateOrder":"ymd"', '"dateOrder":"xyz"'), rows),
    ).toBeNull();
  });

  it("are checked for shape", () => {
    expect(isMapping(mapping)).toBe(true);
    expect(isMapping({ ...mapping, date: -1 })).toBe(false);
    expect(isMapping({ ...mapping, amount: 1.5 })).toBe(false);
    expect(isMapping({ ...mapping, payee: 999 })).toBe(false);
    expect(isMapping(null)).toBe(false);
  });
});
