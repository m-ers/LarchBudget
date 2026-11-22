import { beforeEach, describe, expect, it } from "vitest";
import type { IsoDate } from "../lib/dates";
import { MAX_RULE_TEXT_LENGTH, MAX_RULES } from "../lib/limits";
import { createAccount } from "./accounts";
import * as budget from "./budget";
import { created } from "./created";
import { openDb, type Db } from "./index";
import { createRule, deleteRule, listRules, updateRule } from "./rules";
import {
  editTransaction,
  importTransactions,
  listTransactions,
  sortTransaction,
  undoImport,
  type ImportRow,
} from "./transactions";

let db: Db;
let checking: number;
let groceries: number;
let eating: number;
let salary: number;

/** A row as a bank file would hold it: the raw line is what identifies it. */
const row = (
  date: IsoDate,
  amount: number,
  payee: string,
  note: string | null = null,
): ImportRow => ({
  date,
  amount,
  payee,
  note,
  raw: [date, payee, note ?? "", amount].join(";"),
});

/** Every transaction but the starting balance, as the list shows it, by payee. */
function listed() {
  return Object.fromEntries(
    listTransactions(db, { limit: 100 })
      .filter((transaction) => !transaction.starting)
      .map((transaction) => [transaction.payee ?? transaction.note, transaction]),
  );
}

beforeEach(() => {
  db = openDb(":memory:");
  checking = created(
    createAccount(db, {
      name: "Checking",
      type: "checking",
      startingBalance: 100_000,
      balanceDate: "2026-10-31",
    }),
  );
  const group = created(budget.createGroup(db, "Everyday"));
  groceries = created(budget.createCategory(db, "Groceries", group));
  eating = created(budget.createCategory(db, "Eating out", group));
  salary = created(budget.createIncomeCategory(db, "Salary"));
});

describe("importing with rules", () => {
  it("sorts a row that fits a rule at once, and leaves the others to sort", () => {
    createRule(db, "fresh market", groceries);
    const outcome = importTransactions(
      db,
      checking,
      [row("2026-11-03", -4_510, "FRESH MARKET 0042 AMSTERDAM"), row("2026-11-05", -350, "Bakery")],
      "a",
    );
    expect(outcome).toMatchObject({ imported: 2, byRules: 1 });
    const found = listed();
    expect(found["FRESH MARKET 0042 AMSTERDAM"]).toMatchObject({
      toSort: false,
      categoryId: groceries,
      rule: "fresh market",
    });
    expect(found["Bakery"]).toMatchObject({ toSort: true, categoryId: null, rule: null });
  });

  it("looks in the note too", () => {
    createRule(db, "salary", salary);
    importTransactions(db, checking, [row("2026-11-01", 285_000, "Acme Corp", "Salary Nov")], "a");
    expect(listed()["Acme Corp"]).toMatchObject({ toSort: false, categoryId: salary });
  });

  it("lets the rule with the longest text win", () => {
    createRule(db, "market", eating);
    createRule(db, "fresh market", groceries);
    importTransactions(
      db,
      checking,
      [row("2026-11-03", -4_510, "Fresh Market"), row("2026-11-04", -900, "Night market")],
      "a",
    );
    const found = listed();
    expect(found["Fresh Market"].categoryId).toBe(groceries);
    expect(found["Night market"].categoryId).toBe(eating);
  });

  it("can sort into no category, on purpose", () => {
    createRule(db, "own savings", "ready");
    importTransactions(db, checking, [row("2026-11-02", -10_000, "To own savings")], "a");
    expect(listed()["To own savings"]).toMatchObject({ toSort: false, categoryId: null });
  });

  it("does nothing for a rule whose category was archived", () => {
    createRule(db, "fresh market", groceries);
    budget.archiveCategory(db, groceries);
    expect(
      importTransactions(db, checking, [row("2026-11-03", -4_510, "Fresh Market")], "a"),
    ).toMatchObject({ byRules: 0 });
    expect(listed()["Fresh Market"].toSort).toBe(true);
  });

  it("counts a row only once when the file is imported again", () => {
    createRule(db, "fresh market", groceries);
    const file = [row("2026-11-03", -4_510, "Fresh Market")];
    importTransactions(db, checking, file, "a");
    expect(importTransactions(db, checking, file, "b")).toMatchObject({
      imported: 0,
      byRules: 0,
      duplicates: 1,
    });
  });

  it("does not undo over what a rule sorted, but does over what someone sorted", () => {
    createRule(db, "fresh market", groceries);
    importTransactions(
      db,
      checking,
      [row("2026-11-03", -4_510, "Fresh Market"), row("2026-11-05", -350, "Bakery")],
      "a",
    );
    expect(undoImport(db, "a")).toMatchObject({ removed: 2, sorted: 0 });

    importTransactions(
      db,
      checking,
      [row("2026-11-03", -4_510, "Fresh Market"), row("2026-11-05", -350, "Bakery")],
      "b",
    );
    sortTransaction(db, listed()["Bakery"].id, eating);
    expect(undoImport(db, "b")).toMatchObject({ removed: 0, sorted: 1 });
  });
});

describe("making a rule", () => {
  it("sorts what is still to sort and fits, and says how many", () => {
    importTransactions(
      db,
      checking,
      [
        row("2026-11-03", -4_510, "Fresh Market 1"),
        row("2026-11-04", -3_000, "Fresh Market 2"),
        row("2026-11-05", -350, "Bakery"),
      ],
      "a",
    );
    const made = createRule(db, "Fresh Market", groceries);
    expect(made).toMatchObject({ sorted: 2 });
    const found = listed();
    expect(found["Fresh Market 1"]).toMatchObject({ toSort: false, categoryId: groceries });
    expect(found["Fresh Market 2"]).toMatchObject({ toSort: false, categoryId: groceries });
    expect(found["Bakery"].toSort).toBe(true);
  });

  it("never changes what someone sorted, edited or split", () => {
    importTransactions(
      db,
      checking,
      [
        row("2026-11-03", -4_510, "Fresh Market sorted"),
        row("2026-11-04", -3_000, "Fresh Market edited"),
        row("2026-11-05", -2_000, "Fresh Market split"),
      ],
      "a",
    );
    const before = listed();
    sortTransaction(db, before["Fresh Market sorted"].id, eating);
    editTransaction(db, before["Fresh Market edited"].id, {
      date: "2026-11-04",
      amount: -3_000,
      payee: "Fresh Market edited",
      note: "by hand",
      place: eating,
    });
    editTransaction(db, before["Fresh Market split"].id, {
      date: "2026-11-05",
      amount: -2_000,
      payee: "Fresh Market split",
      note: null,
      place: [
        { categoryId: eating, amount: -1_000 },
        { categoryId: groceries, amount: -1_000 },
      ],
    });
    expect(createRule(db, "fresh market", groceries)).toMatchObject({ sorted: 0 });
    const found = listed();
    expect(found["Fresh Market sorted"]).toMatchObject({ categoryId: eating, rule: null });
    expect(found["Fresh Market edited"]).toMatchObject({ categoryId: eating, rule: null });
    expect(found["Fresh Market split"].parts).toHaveLength(2);
  });

  it("lets the best fitting rule sort a transaction that fits two", () => {
    createRule(db, "fresh market", groceries);
    importTransactions(db, checking, [row("2026-11-03", -4_510, "Fresh Market Bar")], "a");
    // Sent back to sort, then a new rule that says more is made.
    const id = listed()["Fresh Market Bar"].id;
    sortTransaction(db, id, "unsorted");
    createRule(db, "fresh market bar", eating);
    expect(listed()["Fresh Market Bar"]).toMatchObject({ categoryId: eating });
  });

  it("clears the mark when someone sorts the transaction, even into the same category", () => {
    createRule(db, "fresh market", groceries);
    importTransactions(db, checking, [row("2026-11-03", -4_510, "Fresh Market")], "a");
    const { id, rule } = listed()["Fresh Market"];
    expect(rule).toBe("fresh market");
    sortTransaction(db, id, groceries);
    expect(listed()["Fresh Market"].rule).toBeNull();
  });

  it("refuses text that is empty, too long or used already, and a category that is not there", () => {
    expect(createRule(db, "   ", groceries)).toBe("empty");
    expect(createRule(db, "x".repeat(MAX_RULE_TEXT_LENGTH + 1), groceries)).toBe("too-long");
    createRule(db, "Fresh   Market", groceries);
    expect(createRule(db, " fresh market ", eating)).toBe("text-taken");
    expect(createRule(db, "bakery", 9_999)).toBe("no-category");
    budget.archiveCategory(db, eating);
    expect(createRule(db, "bakery", eating)).toBe("no-category");
    expect(listRules(db)).toHaveLength(1);
  });

  it("keeps the text without extra spaces", () => {
    createRule(db, "  Fresh   Market ", groceries);
    expect(listRules(db)[0].text).toBe("Fresh Market");
  });

  it("stops at the most rules there can be", () => {
    for (let i = 0; i < MAX_RULES; i += 1) createRule(db, `shop ${i}`, groceries);
    expect(createRule(db, "one too many", groceries)).toBe("too-many");
  });
});

describe("changing a rule", () => {
  it("moves what the rule sorted, and nothing else", () => {
    createRule(db, "fresh market", groceries);
    importTransactions(
      db,
      checking,
      [row("2026-11-03", -4_510, "Fresh Market 1"), row("2026-11-04", -3_000, "Fresh Market 2")],
      "a",
    );
    sortTransaction(db, listed()["Fresh Market 2"].id, eating);
    const [rule] = listRules(db);
    expect(rule.sorted).toBe(1);

    expect(updateRule(db, rule.id, "fresh market", eating)).toEqual({ sorted: 1 });
    const found = listed();
    expect(found["Fresh Market 1"]).toMatchObject({ categoryId: eating, rule: "fresh market" });
    expect(found["Fresh Market 2"]).toMatchObject({ categoryId: eating, rule: null });
  });

  it("lets go of what no longer fits the new text, and sorts what now fits", () => {
    createRule(db, "fresh market", groceries);
    importTransactions(
      db,
      checking,
      [row("2026-11-03", -4_510, "Fresh Market"), row("2026-11-05", -350, "Bakery")],
      "a",
    );
    const [rule] = listRules(db);
    expect(updateRule(db, rule.id, "bakery", eating)).toEqual({ sorted: 1 });
    const found = listed();
    // The market was sorted into groceries by the old rule, and stays there, now as nobody's rule.
    expect(found["Fresh Market"]).toMatchObject({ categoryId: groceries, rule: null });
    expect(found["Bakery"]).toMatchObject({ categoryId: eating, rule: "bakery", toSort: false });
  });

  it("can change the text alone, and keep an archived category", () => {
    createRule(db, "fresh market", groceries);
    budget.archiveCategory(db, groceries);
    const [rule] = listRules(db);
    expect(rule.categoryArchived).toBe(true);
    expect(updateRule(db, rule.id, "fresh market 42", groceries)).toEqual({ sorted: 0 });
    expect(listRules(db)[0]).toMatchObject({ text: "fresh market 42", categoryId: groceries });
    // But another archived category cannot be chosen.
    budget.archiveCategory(db, eating);
    expect(updateRule(db, rule.id, "fresh market 42", eating)).toBe("no-category");
  });

  it("refuses text used by another rule, but not its own", () => {
    createRule(db, "fresh market", groceries);
    createRule(db, "bakery", eating);
    const [bakery, market] = listRules(db);
    expect(updateRule(db, bakery.id, "Fresh Market", eating)).toBe("text-taken");
    expect(updateRule(db, market.id, "FRESH MARKET", groceries)).toEqual({ sorted: 0 });
    expect(updateRule(db, 9_999, "anything", groceries)).toBe("no-rule");
  });
});

describe("deleting a rule", () => {
  it("leaves what it sorted where it is, as nobody's rule", () => {
    createRule(db, "fresh market", groceries);
    importTransactions(db, checking, [row("2026-11-03", -4_510, "Fresh Market")], "a");
    const [rule] = listRules(db);
    expect(deleteRule(db, rule.id)).toBe(true);
    expect(listed()["Fresh Market"]).toMatchObject({
      categoryId: groceries,
      toSort: false,
      rule: null,
    });
    expect(listRules(db)).toEqual([]);
    expect(deleteRule(db, rule.id)).toBe(false);
  });
});

describe("listing rules", () => {
  it("tells how many transactions each sorted, in the order of the texts", () => {
    createRule(db, "bakery", eating);
    createRule(db, "Fresh market", groceries);
    importTransactions(
      db,
      checking,
      [row("2026-11-03", -4_510, "Fresh Market 1"), row("2026-11-04", -3_000, "Fresh Market 2")],
      "a",
    );
    expect(listRules(db)).toMatchObject([
      { text: "bakery", category: "Eating out", sorted: 0 },
      { text: "Fresh market", category: "Groceries", sorted: 2 },
    ]);
  });
});
