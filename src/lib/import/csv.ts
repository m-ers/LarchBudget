/** Reading bank export files: plain CSV parsing with no bank-specific knowledge. */

type Delimiter = "," | ";" | "\t";

/** Picks the delimiter that occurs most in the first lines, ignoring quoted text. */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/, 10).join("\n");
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of sample) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char in counts) counts[char as Delimiter]++;
  }
  // A semicolon file often has decimal commas inside it, so prefer the rarer
  // but structural characters when they appear at all.
  if (counts["\t"] > 0 && counts["\t"] >= counts[";"]) return "\t";
  if (counts[";"] > 0 && counts[";"] * 2 >= counts[","]) return ";";
  return ",";
}

/**
 * Parses CSV text into rows of cells. Handles quoted cells, doubled quotes,
 * line breaks inside quotes and a leading byte-order mark. Empty lines are
 * dropped and cells are trimmed.
 */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
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
