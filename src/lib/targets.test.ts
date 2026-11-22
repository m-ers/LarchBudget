import { describe, expect, it } from "vitest";
import { addMonths, type Month } from "./dates";
import {
  categoryNeeds,
  heldBefore,
  isTarget,
  readTarget,
  targetNeeds,
  type Target,
} from "./targets";

const NOW: Month = "2026-11";

/** What `target` needs in `month`, seen in November 2026. */
const needs = (target: Target | null, month: Month, held = 0, assigned = 0, thisMonth = NOW) =>
  targetNeeds({ target, month, heldBefore: held, assigned }, thisMonth);

const monthly = (amount: number): Target => ({ kind: "monthly", amount });
const topUp = (amount: number): Target => ({ kind: "topUp", amount });
const byMonth = (amount: number, month: Month): Target => ({ kind: "byMonth", amount, month });

describe("targetNeeds", () => {
  it("needs nothing without a target", () => {
    expect(needs(null, NOW, 5_000, 0)).toBe(0);
  });

  describe("every month", () => {
    it("needs the amount, less what is assigned this month", () => {
      expect(needs(monthly(110_000), NOW)).toBe(110_000);
      expect(needs(monthly(110_000), NOW, 0, 30_000)).toBe(80_000);
    });

    it("ignores what was left from earlier months, which builds up", () => {
      expect(needs(monthly(5_000), NOW, 12_000)).toBe(5_000);
      expect(needs(monthly(5_000), NOW, -3_000)).toBe(5_000);
    });

    it("needs nothing once met, and never less than nothing", () => {
      expect(needs(monthly(110_000), NOW, 0, 110_000)).toBe(0);
      expect(needs(monthly(110_000), NOW, 0, 150_000)).toBe(0);
    });
  });

  describe("top up to", () => {
    it("needs what brings the start of the month to the amount", () => {
      expect(needs(topUp(40_000), NOW)).toBe(40_000);
      // €65 left over from last month: €335 tops it up to €400.
      expect(needs(topUp(40_000), NOW, 6_500)).toBe(33_500);
      expect(needs(topUp(40_000), NOW, 6_500, 20_000)).toBe(13_500);
    });

    it("also makes up for overspending carried over from last month", () => {
      expect(needs(topUp(40_000), NOW, -2_500)).toBe(42_500);
      expect(needs(topUp(40_000), NOW, -2_500, 40_000)).toBe(2_500);
    });

    it("needs nothing when last month left the amount or more", () => {
      expect(needs(topUp(40_000), NOW, 40_000)).toBe(0);
      expect(needs(topUp(40_000), NOW, 52_000)).toBe(0);
      expect(needs(topUp(40_000), NOW, 30_000, 10_000)).toBe(0);
      // €600 left, and €100 of it moved out: still €500.
      expect(needs(topUp(40_000), NOW, 60_000, -10_000)).toBe(0);
    });

    it("does not need more because of spending during the month", () => {
      // Assigned €335 on top of €65 left, then spent €380 this month: the
      // month started at €400, so nothing more is needed.
      const groceries = { target: topUp(40_000), assigned: 33_500, activity: -38_000 };
      expect(categoryNeeds({ ...groceries, available: 6_500 + 33_500 - 38_000 }, NOW, NOW)).toBe(0);
    });
  });

  describe("by a month", () => {
    const holiday = byMonth(120_000, "2027-06");

    it("spreads what is missing over the months left, this month and the target's included", () => {
      // November to June: 8 months of €150.
      expect(needs(holiday, NOW)).toBe(15_000);
      expect(needs(holiday, NOW, 0, 5_000)).toBe(10_000);
      // In December, with €150 put aside: €1,050 over 7 months.
      expect(needs(holiday, "2026-12", 15_000)).toBe(15_000);
    });

    it("rounds up to a whole cent, so the target is reached in time", () => {
      // €1,000 over 3 months: 333.333… becomes 333.34.
      expect(needs(byMonth(100_000, "2027-01"), NOW)).toBe(33_334);
      // €0.01 missing over 8 months is still a cent.
      expect(needs(holiday, NOW, 119_999)).toBe(1);
      // The last month asks for exactly what is left.
      expect(needs(byMonth(100_000, "2027-01"), "2027-01", 66_668)).toBe(33_332);
    });

    it("needs the rest in its own month", () => {
      expect(needs(holiday, "2027-06", 105_000)).toBe(15_000);
      expect(needs(holiday, "2027-06", 105_000, 15_000)).toBe(0);
      // Behind: the whole rest, at once.
      expect(needs(holiday, "2027-06", 30_000, 0, "2027-06")).toBe(90_000);
    });

    it("needs nothing after its month", () => {
      expect(needs(holiday, "2027-07", 30_000, 0, "2027-07")).toBe(0);
      expect(needs(holiday, "2028-01", 0, 0, "2027-07")).toBe(0);
      // Not even money moved out then.
      expect(needs(holiday, "2027-07", 130_000, -20_000, "2027-07")).toBe(0);
    });

    it("needs nothing once the money is there", () => {
      expect(needs(holiday, NOW, 120_000)).toBe(0);
      expect(needs(holiday, NOW, 150_000)).toBe(0);
    });

    it("asks back money moved out only as far as it leaves the amount short", () => {
      // €1,500 at the end of October, and €200 moved out in November: €1,300
      // is still more than €1,200.
      expect(needs(holiday, NOW, 150_000, -20_000)).toBe(0);
      // €400 moved out leaves €1,100: €100 short.
      expect(needs(holiday, NOW, 150_000, -40_000)).toBe(10_000);
      // Not there yet: what was moved out comes on top of this month's share.
      expect(needs(holiday, NOW, 40_000, -5_000)).toBe(10_000 + 5_000);
    });

    it("makes up for overspending carried over", () => {
      // €1,250 missing over 8 months: 156.25.
      expect(needs(holiday, NOW, -5_000)).toBe(15_625);
    });

    it("counts the months across the turn of the year", () => {
      // December and January: €600 each.
      expect(needs(byMonth(120_000, "2027-01"), "2026-12", 0, 0, "2026-12")).toBe(60_000);
      // January only.
      expect(needs(byMonth(120_000, "2027-01"), "2027-01", 60_000, 0, "2027-01")).toBe(60_000);
    });

    it("stays exact for large amounts", () => {
      const large = byMonth(Number.MAX_SAFE_INTEGER, "2027-01");
      // Worked out with whole numbers that cannot round: (n + 2) / 3, rounded down.
      const exact = (BigInt(Number.MAX_SAFE_INTEGER) + 2n) / 3n;
      expect(BigInt(needs(large, NOW))).toBe(exact);
    });

    it("rounds up exactly just around a whole number of cents a month, and over many years", () => {
      for (const [amount, monthsLeft] of [
        [1, 36],
        [35, 36],
        [36, 36],
        [37, 36],
        [100_000_000_00, 7],
        [99_999_999_999, 95_000],
      ]) {
        const target = byMonth(amount, addMonths(NOW, monthsLeft - 1));
        // Rounded up, with whole numbers that cannot round.
        const exact = (BigInt(amount) + BigInt(monthsLeft) - 1n) / BigInt(monthsLeft);
        expect(BigInt(needs(target, NOW)), `${amount} over ${monthsLeft} months`).toBe(exact);
      }
    });
  });

  describe("which months", () => {
    it("asks for money in the current month and in later months", () => {
      expect(needs(monthly(5_000), "2026-11")).toBe(5_000);
      expect(needs(monthly(5_000), "2026-12")).toBe(5_000);
      expect(needs(monthly(5_000), "2028-03")).toBe(5_000);
    });

    it("asks nothing of a month that is over", () => {
      expect(needs(monthly(5_000), "2026-10")).toBe(0);
      expect(needs(topUp(40_000), "2025-11")).toBe(0);
      expect(needs(byMonth(120_000, "2027-06"), "2026-10")).toBe(0);
    });

    it("follows the current month from December into January", () => {
      expect(needs(monthly(5_000), "2026-12", 0, 0, "2026-12")).toBe(5_000);
      expect(needs(monthly(5_000), "2026-12", 0, 0, "2027-01")).toBe(0);
      expect(needs(monthly(5_000), "2027-01", 0, 0, "2027-01")).toBe(5_000);
    });

    it("uses the current month by default", () => {
      const thisMonth = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` as Month;
      })();
      expect(
        targetNeeds({ target: monthly(5_000), month: thisMonth, heldBefore: 0, assigned: 0 }),
      ).toBe(5_000);
      expect(
        targetNeeds({ target: monthly(5_000), month: "2000-01", heldBefore: 0, assigned: 0 }),
      ).toBe(0);
    });
  });
});

describe("categoryNeeds", () => {
  it("works out what the category held before the month from its figures", () => {
    const category = { assigned: 20_000, activity: -5_000, available: 21_000 };
    expect(heldBefore(category)).toBe(6_000);
    expect(categoryNeeds({ ...category, target: topUp(40_000) }, NOW, NOW)).toBe(14_000);
  });

  it("adds up over the categories of a month", () => {
    const categories = [
      // Rent: €1,100 every month, €300 assigned.
      { target: monthly(110_000), assigned: 30_000, activity: 0, available: 30_000 },
      // Groceries: top up to €400, €65 left from last month.
      { target: topUp(40_000), assigned: 0, activity: -2_000, available: 4_500 },
      // Holiday: €1,200 by June 2027.
      { target: byMonth(120_000, "2027-06"), assigned: 0, activity: 0, available: 0 },
      // Eating out: top up to €110, already met.
      { target: topUp(11_000), assigned: 11_000, activity: 0, available: 11_000 },
      // Clothes: no target.
      { target: null, assigned: 0, activity: 0, available: 8_000 },
    ];
    const each = categories.map((c) => categoryNeeds(c, NOW, NOW));
    expect(each).toEqual([80_000, 33_500, 15_000, 0, 0]);
    expect(each.reduce((sum, n) => sum + n, 0)).toBe(128_500);
    // A month that is over needs nothing at all.
    expect(categories.map((c) => categoryNeeds(c, "2026-10", NOW))).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("isTarget and readTarget", () => {
  it("accept a kind, an amount above zero, and a month only for by a month", () => {
    expect(isTarget({ kind: "monthly", amount: 110_000 })).toBe(true);
    expect(isTarget({ kind: "topUp", amount: 1 })).toBe(true);
    expect(isTarget({ kind: "byMonth", amount: 120_000, month: "2027-06" })).toBe(true);

    expect(isTarget({ kind: "weekly", amount: 100 })).toBe(false);
    expect(isTarget({ kind: "monthly", amount: 0 })).toBe(false);
    expect(isTarget({ kind: "monthly", amount: -5 })).toBe(false);
    expect(isTarget({ kind: "monthly", amount: 1.5 })).toBe(false);
    expect(isTarget({ kind: "monthly", amount: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    expect(isTarget({ kind: "monthly", amount: 100, month: "2027-06" })).toBe(false);
    expect(isTarget({ kind: "byMonth", amount: 100 })).toBe(false);
    expect(isTarget({ kind: "byMonth", amount: 100, month: "2027-13" })).toBe(false);
    expect(isTarget(null)).toBe(false);
  });

  it("read what is stored, and treat a broken combination as no target", () => {
    expect(readTarget("monthly", 110_000, null)).toEqual({ kind: "monthly", amount: 110_000 });
    expect(readTarget("topUp", 40_000, "2027-06")).toEqual({ kind: "topUp", amount: 40_000 });
    expect(readTarget("byMonth", 120_000, "2027-06")).toEqual({
      kind: "byMonth",
      amount: 120_000,
      month: "2027-06",
    });
    expect(readTarget(null, null, null)).toBeNull();
    expect(readTarget("byMonth", 120_000, null)).toBeNull();
    expect(readTarget("monthly", null, null)).toBeNull();
    expect(readTarget("monthly", 0, null)).toBeNull();
    expect(readTarget("yearly", 100, null)).toBeNull();
  });
});
