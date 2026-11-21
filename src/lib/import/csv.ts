/** Reading bank export files: plain CSV parsing with no bank-specific knowledge. */

/** The separators tried, in the order that wins a tie. */
export const delimiters = ["\t", ";", "|", ","] as const;
export type Delimiter = (typeof delimiters)[number];

/** Names the separators go by; the words people read are in the message files. */
export const delimiterIds = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
  "|": "pipe",
} as const satisfies Record<Delimiter, string>;

/** How many lines are looked at. */
const SAMPLE_LINES = 50;

/**
 * Picks the delimiter that splits the most sampled lines into the same
 * number of cells, more than one. A stray tab or semicolon inside one cell
 * gives that one line another count, so it cannot win over the real
 * delimiter; and a few lines of account details above the table, which some
 * banks add, do not hide it either. When delimiters tie, the one with more
 * cells wins; a file with no table in it falls back to a comma.
 */
export function detectDelimiter(text: string): Delimiter {
  // Per delimiter, the number of cells of every sampled line; quoted text does not count.
  const cells: Record<Delimiter, number[]> = { ",": [], ";": [], "\t": [], "|": [] };
  let line: Record<Delimiter, number> = { ",": 1, ";": 1, "\t": 1, "|": 1 };
  let lines = 0;
  let quoted = false;
  let empty = true;
  const endLine = () => {
    if (!empty) {
      for (const d of delimiters) cells[d].push(line[d]);
      lines++;
    }
    line = { ",": 1, ";": 1, "\t": 1, "|": 1 };
    empty = true;
  };
  for (const char of text) {
    if (lines >= SAMPLE_LINES) break;
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === "\n") endLine();
    else if (!quoted && char in line) line[char as Delimiter]++;
    if (char !== "\n" && char !== "\r") empty = false;
  }
  endLine();

  // More than one line must agree, unless the file is a single line.
  const needed = Math.min(2, lines);
  let best: { delimiter: Delimiter; width: number; agreeing: number } | null = null;
  for (const delimiter of delimiters) {
    const tally = new Map<number, number>();
    for (const n of cells[delimiter]) if (n > 1) tally.set(n, (tally.get(n) ?? 0) + 1);
    const [width, agreeing] = [...tally].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0] ?? [1, 0];
    const better =
      !best || agreeing > best.agreeing || (agreeing === best.agreeing && width > best.width);
    if (agreeing >= needed && agreeing > 0 && better) best = { delimiter, width, agreeing };
  }
  return best?.delimiter ?? ",";
}

/**
 * Parses CSV text into rows of cells. Handles quoted cells, doubled quotes,
 * line breaks inside quotes and a leading byte-order mark. Empty lines are
 * dropped and cells are trimmed. The separator is guessed unless it is given.
 */
export function parseCsv(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  const input = text.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const endCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      endCell();
    } else if (char === "\n") {
      endRow();
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/** Decodes a file's bytes: UTF-8 when valid, otherwise the Windows encoding older bank exports use. */
export function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
