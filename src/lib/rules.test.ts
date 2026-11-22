import { describe, expect, it } from "vitest";
import { buildMatcher, cleanRuleText, comparable } from "./rules";

const rule = (id: number, text: string, categoryId: number | null = id) => ({
  id,
  text,
  categoryId,
});

describe("cleanRuleText", () => {
  it("trims and joins runs of spaces", () => {
    expect(cleanRuleText("  FRESH \t  MARKET\n")).toBe("FRESH MARKET");
  });
});

describe("comparable", () => {
  it("ignores capitals and runs of spaces", () => {
    expect(comparable("Fresh   MARKET ")).toBe("fresh market");
  });
});

describe("buildMatcher", () => {
  it("finds a rule whose text is in the payee, ignoring capitals", () => {
    const match = buildMatcher([rule(1, "fresh market")]);
    expect(match("FRESH MARKET 0042 AMSTERDAM", null)?.id).toBe(1);
  });

  it("finds a rule whose text is in the note", () => {
    const match = buildMatcher([rule(1, "rent")]);
    expect(match("Mr Jones", "Rent for November")?.id).toBe(1);
  });

  it("does not match across the end of the payee and the start of the note", () => {
    const match = buildMatcher([rule(1, "market fresh")]);
    expect(match("Fresh Market", "Fresh Market")).toBeNull();
    expect(match("Fresh market", "fresh market")).toBeNull();
    expect(match("The market", "fresh bread")).toBeNull();
  });

  it("sees spaces inside the text and the transaction as one", () => {
    const match = buildMatcher([rule(1, "fresh   market")]);
    expect(match("FRESH MARKET", null)?.id).toBe(1);
    expect(match("Fresh      Market", null)?.id).toBe(1);
  });

  it("lets the longest text win, and the oldest rule win a tie", () => {
    const match = buildMatcher([
      rule(1, "market"),
      rule(2, "fresh market"),
      rule(3, "FRESH MARKET"),
    ]);
    expect(match("Fresh Market 12", null)?.id).toBe(2);
    expect(match("Corner market", null)?.id).toBe(1);
  });

  it("matches nothing without words, or without rules", () => {
    expect(buildMatcher([rule(1, "a")])(null, null)).toBeNull();
    expect(buildMatcher([rule(1, "a")])("", "")).toBeNull();
    expect(buildMatcher([])("anything", null)).toBeNull();
  });

  it("ignores a rule with no text, so it cannot sort everything", () => {
    expect(buildMatcher([rule(1, "   ")])("anything", null)).toBeNull();
  });

  it("can sort into no category", () => {
    const match = buildMatcher([rule(1, "savings", null)]);
    expect(match("To savings account", null)).toEqual({
      id: 1,
      text: "savings",
      categoryId: null,
    });
  });
});
