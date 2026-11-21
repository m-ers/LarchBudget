import { describe, expect, it } from "vitest";
import { readAddress, transactionsHref } from "./transactions-address";

describe("reading the address", () => {
  it("reads a filtered, paged list", () => {
    const address = readAddress({
      show: "all",
      q: "  coffee ",
      account: "3",
      category: "none",
      month: "2026-11",
      before: "2026-11-05_42",
    });
    expect(address).toEqual({
      showAll: true,
      before: { date: "2026-11-05", id: 42 },
      filter: { q: "coffee", accountId: 3, category: "none", month: "2026-11" },
    });
  });

  it("reads a category by its number", () => {
    expect(readAddress({ show: "all", category: "12" }).filter).toEqual({ category: 12 });
  });

  it("ignores anything that is not what it should be", () => {
    const address = readAddress({
      show: "all",
      account: "2.5",
      category: "-1",
      month: "2026-13",
      before: "yesterday_1.5",
      limit: "200.5",
    });
    expect(address).toEqual({ showAll: true, filter: {} });
    expect(readAddress({ show: ["all", "x"], account: ["x", "4"], q: [] }).filter).toEqual({});
    expect(readAddress({ show: "all", account: "99999999999999999999" }).filter).toEqual({});
  });

  it("applies the filter to the All list only", () => {
    expect(readAddress({ q: "coffee" })).toEqual({ showAll: false, filter: {} });
  });

  it("cuts a very long search short", () => {
    expect(readAddress({ show: "all", q: "x".repeat(500) }).filter.q).toHaveLength(100);
  });
});

describe("writing the address", () => {
  it("gives back what was read", () => {
    const address = readAddress({
      show: "all",
      q: "a&b",
      category: "7",
      month: "2026-11",
      before: "2026-11-05_42",
    });
    const href = new URL(transactionsHref(address), "http://localhost");
    expect(readAddress(Object.fromEntries(href.searchParams))).toEqual(address);
  });

  it("is short for the plain lists", () => {
    expect(transactionsHref({ showAll: false, filter: {} })).toBe("/transactions");
    expect(transactionsHref({ showAll: true, filter: {} })).toBe("/transactions?show=all");
  });
});
