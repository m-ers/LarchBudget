import { describe, expect, it } from "vitest";
import { explainAvailable, gaugeLevel } from "./gauge";

describe("gaugeLevel", () => {
  it("is full when nothing was spent this month", () => {
    expect(gaugeLevel(75_000, 0)).toEqual({ state: "ok", left: 1 });
  });

  it("shows the share left of what the category held this month", () => {
    expect(gaugeLevel(23_700, -21_600)).toEqual({ state: "ok", left: 23_700 / 45_300 });
    expect(gaugeLevel(2_500, -7_500).left).toBe(0.25);
  });

  it("does not count a refund as spending", () => {
    expect(gaugeLevel(10_000, 6_000)).toEqual({ state: "ok", left: 1 });
  });

  it("is empty at exactly zero and over when overspent", () => {
    expect(gaugeLevel(0, -110_000)).toEqual({ state: "empty", left: 0 });
    expect(gaugeLevel(-3_500, -16_100)).toEqual({ state: "over", left: 0 });
  });
});

describe("explainAvailable", () => {
  const explain = (assigned: number, activity: number, available: number) =>
    explainAvailable({ assigned, activity, available }, "EUR", "en-US");

  it("adds up what came from earlier months, what was assigned and what was spent", () => {
    expect(explain(115_000, -110_000, -215_000)).toBe(
      "Overspent by €2,150.00: assign more to cover it. " +
        "-€2,200.00 from earlier months + €1,150.00 assigned − €1,100.00 spent",
    );
    expect(explain(50_000, -12_000, 63_000)).toBe(
      "€250.00 from earlier months + €500.00 assigned − €120.00 spent",
    );
  });

  it("leaves out a part that is zero", () => {
    expect(explain(50_000, -12_000, 38_000)).toBe("€500.00 assigned − €120.00 spent");
    expect(explain(0, 0, 40_000)).toBe("€400.00 from earlier months");
    expect(explain(0, -3_000, -3_000)).toBe(
      "Overspent by €30.00: assign more to cover it. -€30.00 spent",
    );
  });

  it("names a net refund and money taken back out", () => {
    expect(explain(10_000, 6_000, 16_000)).toBe("€100.00 assigned + €60.00 refunded");
    expect(explain(-5_000, 0, 25_000)).toBe("€300.00 from earlier months − €50.00 assigned");
  });

  it("says so when there is nothing to add up", () => {
    expect(explain(0, 0, 0)).toBe("Nothing assigned or spent this month.");
  });
});
