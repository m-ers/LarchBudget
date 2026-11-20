import { describe, expect, it } from "vitest";
import { parseBankAmount } from "./amount";
import { detectDelimiter, parseCsv } from "./csv";
import { detectDateOrder, isDateOrderAmbiguous, isMonthFirstLocale, parseBankDate } from "./dates";
import {
  applyMapping,
  detectMapping,
  isDateOrderGuess,
  isMapping,
  layoutSignature,
  readSavedMapping,
  serializeMapping,
  type Mapping,
} from "./mapping";

describe("parseCsv", () => {
  it("detects the delimiter", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter('a;b;c\n1;"2,50";3')).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2,50\t3")).toBe("\t");
    expect(detectDelimiter('"Datum";"Bedrag"\n"20261103";"12,50"')).toBe(";");
    expect(detectDelimiter("a|b|c\n1|2|3")).toBe("|");
    expect(detectDelimiter("just one column\nanother line")).toBe(",");
  });

  it("is not thrown off by a stray tab or semicolon inside one cell", () => {
    const tab = "Date,Description,Amount\n2026-11-03,SHOP\tAMSTERDAM,-12.50";
    expect(detectDelimiter(tab)).toBe(",");
    expect(parseCsv(tab)[1]).toEqual(["2026-11-03", "SHOP\tAMSTERDAM", "-12.50"]);
    const semicolons = "Date,Description,Amount\n2026-11-03,a;b;c,-12.50";
    expect(detectDelimiter(semicolons)).toBe(",");
    expect(parseCsv(semicolons)[1]).toEqual(["2026-11-03", "a;b;c", "-12.50"]);
  });

  it("looks at the whole sample, ignores quoted text and prefers more columns on a tie", () => {
    // Decimal commas are in every line, but the semicolon splits into more cells.
    expect(detectDelimiter("a;b;c\n1;2,5;3,5\n4;5,5;6,5")).toBe(";");
    expect(detectDelimiter('a;b\n"x;y;z";"1,5"')).toBe(";");
    // One odd line among many does not matter.
    const lines = Array.from({ length: 9 }, () => "1;2;3").concat("1;2;3,4,5");
    expect(detectDelimiter(["a;b;c", ...lines].join("\n"))).toBe(";");
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
    expect(parseBankAmount("12.500", 2)).toBe(1250000);
    expect(parseBankAmount("123,456", 2)).toBe(12345600);
  });

  it("reads three decimals as decimals unless 1 to 3 digits without a leading zero come before", () => {
    expect(parseBankAmount("1.234", 3)).toBe(1234);
    expect(parseBankAmount("0.500", 2)).toBe(50);
    expect(parseBankAmount("0,500", 2)).toBe(50);
    expect(parseBankAmount(".500", 2)).toBe(50);
    expect(parseBankAmount("1234.500", 2)).toBe(123450);
    expect(parseBankAmount("01.500", 2)).toBe(150);
  });

  it("refuses three decimals that would lose a digit", () => {
    expect(parseBankAmount("0.505", 2)).toBeNull();
    expect(parseBankAmount("1234.567", 2)).toBeNull();
  });

  it("reads every way of writing a negative", () => {
    expect(parseBankAmount("-12,50", 2)).toBe(-1250);
    expect(parseBankAmount("12,50-", 2)).toBe(-1250);
    expect(parseBankAmount("(12.50)", 2)).toBe(-1250);
    expect(parseBankAmount("+12,50", 2)).toBe(1250);
    expect(parseBankAmount("- 12,50", 2)).toBe(-1250);
  });

  it("reads the sign before or after the currency", () => {
    expect(parseBankAmount("-$12.50", 2)).toBe(-1250);
    expect(parseBankAmount("-€12,50", 2)).toBe(-1250);
    expect(parseBankAmount("+$5.00", 2)).toBe(500);
    expect(parseBankAmount("-EUR 12,50", 2)).toBe(-1250);
    expect(parseBankAmount("€ -12,50", 2)).toBe(-1250);
    expect(parseBankAmount("12,50-EUR", 2)).toBe(-1250);
    expect(parseBankAmount("-€12,50-", 2)).toBeNull();
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
    // Ambiguous: day-first wins, unless the locale writes the month first.
    expect(detectDateOrder(["03-11-2026", "04-11-2026"])).toBe("dmy");
    expect(detectDateOrder(["11/03/2026", "11/04/2026"], true)).toBe("mdy");
    // What the file says beats the locale.
    expect(detectDateOrder(["13/03/2026", "11/04/2026"], true)).toBe("dmy");
    expect(detectDateOrder(["20261103", "20261104"], true)).toBe("ymd");
  });

  it("says when the order is only a guess", () => {
    expect(isDateOrderAmbiguous(["11/03/2026", "11/04/2026"])).toBe(true);
    expect(isDateOrderAmbiguous(["11/25/2026", "11/04/2026"])).toBe(false);
    expect(isDateOrderAmbiguous(["20261103", "20261104"])).toBe(false);
    expect(isDateOrderAmbiguous([])).toBe(false);
    expect(isMonthFirstLocale("en-US")).toBe(true);
    expect(isMonthFirstLocale("nl-NL")).toBe(false);
    expect(isMonthFirstLocale("en-GB")).toBe(false);
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

  it("finds the date in a file without a header and the amount beside the balance", () => {
    const rows = parseCsv(noHeader);
    const mapping = detectMapping(rows, 2);
    // Column 4 is the balance after the first row; column 7 is what moved it.
    expect(mapping).toMatchObject({ hasHeader: false, date: 2, dateOrder: "ymd", amount: 6 });
    const result = applyMapping(rows, { ...mapping, payee: 7 }, 2);
    expect(result.rows).toMatchObject([
      { date: "2026-11-03", amount: -4510, payee: "BEA Fresh Market" },
      { date: "2026-11-01", amount: 285000, payee: "SEPA Acme Corp Salary" },
    ]);
  });

  it("does not take the running balance for the amount, whichever way the rows run", () => {
    const newestFirst =
      "2026-11-03;-45,10;1954,90\n2026-11-02;-5,00;2000,00\n2026-11-01;2850,00;2005,00";
    expect(detectMapping(parseCsv(newestFirst), 2).amount).toBe(1);
    const oldestFirst =
      "2026-11-01;2850,00;2005,00\n2026-11-02;-5,00;2000,00\n2026-11-03;-45,10;1954,90";
    expect(detectMapping(parseCsv(oldestFirst), 2).amount).toBe(1);
    // Amounts that move nothing are left alone: the first numeric column is taken.
    expect(detectMapping(parseCsv("2026-11-03;12,50;99,00\n2026-11-02;3,50;77,00"), 2).amount).toBe(
      1,
    );
  });

  it("does not take a column of only C (Cleared) for money out or in", () => {
    const rows = parseCsv(
      "Date,Payee,Cleared,Amount\n2026-11-03,Shop,C,-12.50\n2026-11-04,Cafe,C,-3.50",
    );
    const mapping = detectMapping(rows, 2);
    expect(mapping).toMatchObject({ amount: 3, indicator: null });
    expect(applyMapping(rows, mapping, 2).rows.map((r) => r.amount)).toEqual([-1250, -350]);
  });

  it("still finds an unnamed column that holds both out and in values", () => {
    const rows = parseCsv("2026-11-03;Shop;D;12,50\n2026-11-04;Pay;C;100,00");
    expect(detectMapping(rows, 2)).toMatchObject({ hasHeader: false, amount: 3, indicator: 2 });
  });

  it("breaks a day-or-month tie with the locale", () => {
    const rows = parseCsv("Date,Name,Amount\n11/03/2026,Shop,-12.50\n11/04/2026,Cafe,-3.50");
    expect(detectMapping(rows, 2)).toMatchObject({ dateOrder: "dmy" });
    const mapping = detectMapping(rows, 2, true);
    expect(mapping.dateOrder).toBe("mdy");
    expect(isDateOrderGuess(rows, mapping)).toBe(true);
    expect(isDateOrderGuess(parseCsv("Date,Name,Amount\n11/25/2026,Shop,-12.50"), mapping)).toBe(
      false,
    );
  });

  describe("separate columns for money out and in", () => {
    const layouts: Record<string, string> = {
      "Debit/Credit":
        "Date,Description,Debit,Credit\n2026-11-03,Shop,12.50,\n2026-11-01,Pay,,2850.00",
      "Af/Bij": "Datum;Naam;Af;Bij\n20261103;Shop;12,50;\n20261101;Pay;;2850,00",
      "Withdrawal/Deposit":
        "Date,Memo,Withdrawal,Deposit\n2026-11-03,Shop,12.50,\n2026-11-01,Pay,,2850.00",
      "Uit/In": "Datum;Naam;Uit;In\n20261103;Shop;12,50;\n20261101;Pay;;2850,00",
      "Bedrag af/Bedrag bij":
        "Datum;Naam;Bedrag af;Bedrag bij\n20261103;Shop;12,50;\n20261101;Pay;;2850,00",
    };

    for (const [name, text] of Object.entries(layouts)) {
      it(`are found from the headers: ${name}`, () => {
        const rows = parseCsv(text);
        const mapping = detectMapping(rows, 2);
        expect(mapping).toMatchObject({ amount: 2, amountIn: 3, indicator: null });
        expect(applyMapping(rows, mapping, 2).rows.map((r) => r.amount)).toEqual([-1250, 285000]);
      });
    }

    it("use whichever cell is filled, and in minus out when both are", () => {
      const rows = parseCsv(
        "Date,Name,Debit,Credit\n2026-11-03,A,-12.50,\n2026-11-04,B,,5.00\n2026-11-05,C,2.00,5.00\n2026-11-06,D,,\n2026-11-07,E,x,",
      );
      const mapping = { ...detectMapping(rows, 2), amount: 2, amountIn: 3 };
      const result = applyMapping(rows, mapping, 2);
      expect(result.rows.map((r) => r.amount)).toEqual([-1250, 500, 300]);
      expect(result.skipped).toEqual([
        { line: 5, reason: "No readable amount" },
        { line: 6, reason: "No readable amount" },
      ]);
    });

    it("are not taken when Af Bij is one column saying out or in", () => {
      expect(detectMapping(parseCsv(ing), 2)).toMatchObject({
        amount: 6,
        amountIn: null,
        indicator: 5,
      });
    });

    it("can be chosen by hand and are saved with the mapping", () => {
      const rows = parseCsv("a,b,c,d\n2026-11-03,Shop,12.50,\n2026-11-01,Pay,,2850.00");
      const mapping = { ...detectMapping(rows, 2), amount: 2, amountIn: 3 };
      expect(applyMapping(rows, mapping, 2).rows.map((r) => r.amount)).toEqual([-1250, 285000]);
      expect(readSavedMapping(serializeMapping(rows, mapping), rows)).toEqual(mapping);
      expect(isMapping({ ...mapping, amountIn: 999 })).toBe(false);
      expect(isMapping({ ...mapping, amountIn: 1.5 })).toBe(false);
    });
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

  it("from before there was a money-in column are still read", () => {
    const old: Partial<Mapping> = { ...mapping };
    delete old.amountIn;
    const stored = JSON.stringify({ signature: layoutSignature(rows, mapping), mapping: old });
    const read = readSavedMapping(stored, rows);
    expect(read).toEqual(old);
    expect(applyMapping(rows, read!, 2).rows).toMatchObject(expected);
  });

  it("are checked for shape", () => {
    expect(isMapping(mapping)).toBe(true);
    expect(isMapping({ ...mapping, date: -1 })).toBe(false);
    expect(isMapping({ ...mapping, amount: 1.5 })).toBe(false);
    expect(isMapping({ ...mapping, payee: 999 })).toBe(false);
    expect(isMapping(null)).toBe(false);
  });
});
