/**
 * Finds text people read that is written in the code instead of
 * `src/i18n/messages/en.json`, and texts in en.json that nothing uses.
 * `npm run check:i18n` fails on either, and says where.
 *
 * Text is:
 * - words between JSX tags: `<p>Nothing yet.</p>`;
 * - a written value of an attribute that people read or hear, such as
 *   `aria-label="Close"` or `title={`Rename ${name}`}`;
 * - written text inside `{…}` between JSX tags: `{pending ? "Saving…" : "Save"}`;
 * - the value of a property that holds text, such as `{ label: "Rent" }`;
 * - the message of `fail("…")` in the Server Actions.
 *
 * `npm run check:i18n -- --loose` also lists other strings that look like
 * words for people, such as a sentence kept in a constant first. That list
 * is a hint and never fails.
 *
 * Put `// i18n-ignore` (or `{/* i18n-ignore *\/}` in JSX) on the line above
 * something that is not text people read, such as a brand name.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import english from "../src/i18n/messages/en.json";

const ROOT = path.join(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

/** Attributes whose value people read or hear. */
const TEXT_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "alt",
  "title",
  "placeholder",
  "label",
  "lead",
  "tip",
  "hint",
  "error",
  "message",
  "confirm",
  "description",
]);

/** Words that stay the same in every language. */
const NOT_TEXT = /^(LarchBudget|CSV)$/;

const LOOSE = process.argv.includes("--loose");

const SHOWING_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/** Whether `node` is shown as it is between JSX tags, through `?:`, `&&`, `??` or `||`. */
function shownInJsx(node: ts.Node): boolean {
  let parent = node.parent;
  while (
    parent &&
    (ts.isConditionalExpression(parent) ||
      (ts.isBinaryExpression(parent) && SHOWING_OPERATORS.has(parent.operatorToken.kind)) ||
      ts.isParenthesizedExpression(parent))
  ) {
    if (ts.isConditionalExpression(parent) && parent.condition === node) return false;
    // In `a && b`, only `b` can be shown.
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      parent.left === node
    ) {
      return false;
    }
    node = parent;
    parent = node.parent;
  }
  return !!parent && ts.isJsxExpression(parent) && !ts.isJsxAttribute(parent.parent);
}

/** A key such as `nav.budget`, or a path such as `/transactions`. */
const NOT_WORDS = /^([\w-]+\.)+[\w-]+$|^\//;

const hasWords = (text: string) =>
  /\p{L}{2,}/u.test(text) && !NOT_TEXT.test(text.trim()) && !NOT_WORDS.test(text.trim());

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

type Finding = { file: string; line: number; text: string; hint?: boolean };

function check(file: string, used: Set<string>, prefixes: Set<string>): Finding[] {
  const code = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const lines = code.split("\n");
  const findings: Finding[] = [];

  const ignored = (node: ts.Node) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line;
    return /i18n-ignore/.test(lines[line - 1] ?? "") || /i18n-ignore/.test(lines[line] ?? "");
  };
  const reported = new Set<ts.Node>();
  const report = (node: ts.Node, text: string, hint = false) => {
    if (ignored(node) || reported.has(node)) return;
    reported.add(node);
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    findings.push({ file: path.relative(ROOT, file), line, text: text.trim().slice(0, 70), hint });
  };
  const writtenText = (node: ts.Node): string | undefined => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
    }
    return undefined;
  };

  const visit = (node: ts.Node) => {
    // Keys in use: any string that is a key, or the fixed start of a key
    // built at runtime, such as `accounts.types.${type}`.
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) used.add(node.text);
    if (ts.isTemplateExpression(node) && /^[\w.]+\.$/.test(node.head.text)) {
      prefixes.add(node.head.text);
    }

    if (ts.isJsxText(node) && hasWords(node.text)) report(node, node.text);

    const written = writtenText(node);
    if (written !== undefined && hasWords(written)) {
      if (shownInJsx(node)) report(node, written);
      else if (
        ts.isPropertyAssignment(node.parent) &&
        node.parent.initializer === node &&
        TEXT_ATTRIBUTES.has(node.parent.name.getText())
      ) {
        report(node, written);
      } else if (
        LOOSE &&
        /^\p{Lu}\p{Ll}*(\s|$)/u.test(written) &&
        /\s/.test(written.trim()) &&
        !ts.isImportDeclaration(node.parent) &&
        !ts.isBinaryExpression(node.parent) &&
        !ts.isCaseClause(node.parent)
      ) {
        report(node, written, true);
      }
    }

    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText()) && node.initializer) {
      const value = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      const text = value && writtenText(value);
      if (text !== undefined && hasWords(text)) report(node, text);
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fail" &&
      node.arguments[0]
    ) {
      const text = writtenText(node.arguments[0]);
      if (text !== undefined && hasWords(text)) report(node, text);
    }

    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

const PLURAL_FORM = /_(zero|one|two|few|many|other)$/;

function keys(tree: object, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [prefix + key] : keys(value, `${prefix}${key}.`),
  );
}

const used = new Set<string>();
const prefixes = new Set<string>();
const files = sourceFiles(SRC).filter((file) => !file.startsWith(path.join(SRC, "i18n")));
const findings = files.flatMap((file) => check(file, used, prefixes));

// A string that looks like a key (it starts with a section of en.json) but
// is none, such as a key in a validation schema with a typo.
const allKeys = new Set(keys(english).flatMap((key) => [key, key.replace(PLURAL_FORM, "")]));
const sections = Object.keys(english);
const looksLikeKey = (text: string) =>
  /^[\w]+(\.[\w]+)+$/.test(text) && sections.includes(text.split(".")[0]);
const unknown = [...used].filter((text) => looksLikeKey(text) && !allKeys.has(text));
const unknownPrefixes = [...prefixes].filter(
  (prefix) =>
    sections.includes(prefix.split(".")[0]) && ![...allKeys].some((k) => k.startsWith(prefix)),
);

const unused = keys(english).filter((key) => {
  const base = key.replace(PLURAL_FORM, "");
  return !used.has(key) && !used.has(base) && ![...prefixes].some((p) => key.startsWith(p));
});

const errors = findings.filter((f) => !f.hint);
const hints = findings.filter((f) => f.hint);
for (const { file, line, text } of errors) console.log(`${file}:${line}  ${text}`);
if (errors.length > 0) {
  console.log(
    `\n${errors.length} text(s) written in the code: move them to src/i18n/messages/en.json.`,
  );
}
for (const { file, line, text } of hints) console.log(`maybe ${file}:${line}  ${text}`);
if (hints.length > 0) console.log(`\n${hints.length} string(s) that may be text: check them.`);
for (const key of unused) console.log(`en.json: ${key} is not used`);
if (unused.length > 0) console.log(`\n${unused.length} text(s) in en.json that nothing uses.`);
for (const key of [...unknown, ...unknownPrefixes]) console.log(`${key} is not a key in en.json`);
if (errors.length > 0 || unused.length > 0 || unknown.length + unknownPrefixes.length > 0) {
  process.exit(1);
}
console.log("Every text is in en.json, and every text in en.json is used.");
