import { describe, expect, it } from "vitest";
import { addMonths, type Month } from "./dates";
import {
  countsFor,
  readyLines,
  splitReadyToAssign,
  type AssignedIn,
  type MoneyIn,
  type ReadyBreakdown,
} from "./ready";

const other = (month: Month, amount: number): MoneyIn => ({
  month,
  amount,
  income: false,
  nextMonth: false,
});
const income = (month: Month, amount: number, nextMonth = false): MoneyIn => ({
  month,
  amount,
  income: true,
  nextMonth,
});

const nothing: ReadyBreakdown = {
  leftOver: 0,
  received: 0,
  withoutCategory: 0,
  assigned: 0,
  assignedLater: 0,
  alreadyIn: 0,
  beyondNextMonth: false,
};

const total = (breakdown: ReadyBreakdown) =>
  readyLines(breakdown).reduce((sum, line) => sum + line.amount, 0);

describe("countsFor", () => {
  it("is the month the money came in", () => {
    expect(countsFor(other("2026-10", 100))).toBe("2026-10");
    expect(countsFor(income("2026-10", 100))).toBe("2026-10");
  });

  it("is the month after for income that counts for the next month, also across the year", () => {
    expect(countsFor(income("2026-10", 100, true))).toBe("2026-11");
    expect(countsFor(income("2026-12", 100, true))).toBe("2027-01");
  });

  it("ignores counting for the next month outside an income category", () => {
    expect(countsFor({ ...other("2026-10", 100), nextMonth: true })).toBe("2026-10");
  });
});

describe("splitReadyToAssign", () => {
  it("is all zero without money or assignments", () => {
    expect(splitReadyToAssign("2026-11", [], [])).toEqual(nothing);
  });

  it("puts money in the part of the month it counts for", () => {
    const money = [
      other("2026-09", 1),
      other("2026-10", 10),
      income("2026-10", 100, true),
      income("2026-11", 1_000),
      other("2026-11", 10_000),
      income("2026-11", 100_000, true),
      other("2026-12", 1_000_000),
    ];
    expect(splitReadyToAssign("2026-11", money, [])).toEqual({
      ...nothing,
      leftOver: 11,
      received: 1_100,
      withoutCategory: 10_000,
      alreadyIn: 1_100_000,
    });
  });

  it("puts assignments before, in and after the month in their own parts", () => {
    const assigned: AssignedIn[] = [
      { month: "2026-09", amount: 1 },
      { month: "2026-10", amount: 10 },
      { month: "2026-11", amount: 100 },
      { month: "2026-12", amount: 1_000 },
      { month: "2027-03", amount: 10_000 },
    ];
    expect(splitReadyToAssign("2026-11", [], assigned)).toEqual({
      ...nothing,
      leftOver: -11,
      assigned: 100,
      assignedLater: 11_000,
    });
  });

  it("crosses the turn of the year", () => {
    const money = [income("2026-12", 285_000, true), other("2027-01", 50)];
    const assigned = [{ month: "2026-12" as Month, amount: 20_000 }];
    expect(splitReadyToAssign("2027-01", money, assigned)).toEqual({
      ...nothing,
      leftOver: -20_000,
      received: 285_000,
      withoutCategory: 50,
    });
    expect(splitReadyToAssign("2026-12", money, assigned)).toEqual({
      ...nothing,
      assigned: 20_000,
      alreadyIn: 285_050,
    });
  });

  it("says when money is in already for a month after the next one", () => {
    const next = splitReadyToAssign("2026-11", [income("2026-11", 285_000, true)], []);
    expect(next).toMatchObject({ alreadyIn: 285_000, beyondNextMonth: false });

    const later = splitReadyToAssign("2026-10", [income("2026-11", 285_000, true)], []);
    expect(later).toMatchObject({ alreadyIn: 285_000, beyondNextMonth: true });
    expect(
      splitReadyToAssign("2026-11", [other("2026-12", 50), other("2027-02", -20)], []),
    ).toMatchObject({ alreadyIn: 30, beyondNextMonth: true });
  });

  it("does not speak of later months for money that cancels out there", () => {
    // A transfer between two accounts, dated in two months' time.
    const transfer = [other("2026-12", 5_000), other("2027-01", 20_000), other("2027-01", -20_000)];
    expect(splitReadyToAssign("2026-11", transfer, [])).toMatchObject({
      alreadyIn: 5_000,
      beyondNextMonth: false,
    });
  });

  it("always adds up to all the money less everything assigned, for any month", () => {
    // Made-up but repeatable data: amounts in and out over two years, some
    // of it income that counts for the next month, and assignments,
    // negative ones too.
    let state = 7;
    const random = (n: number) => {
      state = (state * 1664525 + 1013904223) % 2 ** 32;
      return state % n;
    };
    const months = Array.from({ length: 24 }, (_, i) => addMonths("2025-12", i));
    const money = Array.from({ length: 200 }, () => {
      const kind = random(3);
      return {
        month: months[random(months.length)],
        amount: random(500_000) - 200_000,
        income: kind > 0,
        nextMonth: kind === 2,
      };
    });
    const assigned = Array.from({ length: 60 }, () => ({
      month: months[random(months.length)],
      amount: random(100_000) - 10_000,
    }));
    const ready =
      money.reduce((sum, m) => sum + m.amount, 0) - assigned.reduce((sum, a) => sum + a.amount, 0);

    for (const month of [addMonths("2025-12", -3), ...months, addMonths("2025-12", 27)]) {
      expect(total(splitReadyToAssign(month, money, assigned)), month).toBe(ready);
    }
  });
});

describe("readyLines", () => {
  it("always shows what was left over, received and assigned", () => {
    expect(readyLines(nothing)).toEqual([
      { part: "leftOver", amount: 0 },
      { part: "received", amount: 0 },
      { part: "assigned", amount: 0 },
    ]);
  });

  it("shows the other parts only when they are not zero, in the order of the sum", () => {
    const lines = readyLines({
      leftOver: -5_000,
      received: 285_000,
      withoutCategory: -735,
      assigned: 229_500,
      assignedLater: 10_000,
      alreadyIn: 285_000,
      beyondNextMonth: false,
    });
    expect(lines).toEqual([
      { part: "leftOver", amount: -5_000 },
      { part: "received", amount: 285_000 },
      { part: "withoutCategory", amount: -735 },
      { part: "assigned", amount: -229_500 },
      { part: "assignedLater", amount: -10_000 },
      { part: "alreadyIn", amount: 285_000 },
    ]);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(324_765);
  });

  it("adds what was taken back out of categories", () => {
    expect(readyLines({ ...nothing, assigned: -2_000, assignedLater: -500 })).toEqual([
      { part: "leftOver", amount: 0 },
      { part: "received", amount: 0 },
      { part: "assigned", amount: 2_000 },
      { part: "assignedLater", amount: 500 },
    ]);
  });
});
