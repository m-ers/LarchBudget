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
    explainAvailable({ assigned, activity, available });

  it("adds up what came from earlier months, what was assigned and what was spent", () => {
    expect(explain(115_000, -110_000, -215_000)).toEqual({
      overspentBy: 215_000,
      parts: [
        { kind: "earlier", amount: -220_000 },
        { kind: "assigned", amount: 115_000 },
        { kind: "spent", amount: -110_000 },
      ],
    });
    expect(explain(50_000, -12_000, 63_000)).toEqual({
      overspentBy: null,
      parts: [
        { kind: "earlier", amount: 25_000 },
        { kind: "assigned", amount: 50_000 },
        { kind: "spent", amount: -12_000 },
      ],
    });
  });

  it("leaves out a part that is zero", () => {
    expect(explain(50_000, -12_000, 38_000).parts).toEqual([
      { kind: "assigned", amount: 50_000 },
      { kind: "spent", amount: -12_000 },
    ]);
    expect(explain(0, 0, 40_000).parts).toEqual([{ kind: "earlier", amount: 40_000 }]);
    expect(explain(0, -3_000, -3_000)).toEqual({
      overspentBy: 3_000,
      parts: [{ kind: "spent", amount: -3_000 }],
    });
  });

  it("names a net refund and money taken back out", () => {
    expect(explain(10_000, 6_000, 16_000).parts).toEqual([
      { kind: "assigned", amount: 10_000 },
      { kind: "refunded", amount: 6_000 },
    ]);
    expect(explain(-5_000, 0, 25_000).parts).toEqual([
      { kind: "earlier", amount: 30_000 },
      { kind: "assigned", amount: -5_000 },
    ]);
  });

  it("has no parts when there is nothing to add up", () => {
    expect(explain(0, 0, 0)).toEqual({ overspentBy: null, parts: [] });
  });
});
