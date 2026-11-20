/** Reading bank export files: plain CSV parsing with no bank-specific knowledge. */

/** The separators tried, in the order that wins a tie. */
export const delimiters = ["\t", ";", "|", ","] as const;
export type Delimiter = (typeof delimiters)[number];

export const delimiterLabels: Record<Delimiter, string> = {
  ",": "Comma",
  ";": "Semicolon",
  "\t": "Tab",
  "|": "Pipe",
};

/** How many lines are looked at, and how many of them must agree. */
const SAMPLE_LINES = 20;
const AGREEMENT = 0.8;

/**
 * Picks the delimiter that splits (nearly) every sampled line into the same
 * number of cells, more than one. A stray tab or semicolon inside one cell
 * gives that line another count, so it cannot win over the real delimiter.
 * When several qualify, the one with more cells wins; falls back to a comma.
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

  let best: { delimiter: Delimiter; width: number } | null = null;
  for (const delimiter of delimiters) {
    const counts = cells[delimiter];
    const tally = new Map<number, number>();
    for (const n of counts) tally.set(n, (tally.get(n) ?? 0) + 1);
    const [width, agreeing] = [...tally].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0] ?? [1, 0];
    if (width > 1 && agreeing >= counts.length * AGREEMENT && (!best || width > best.width)) {
      best = { delimiter, width };
    }
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
