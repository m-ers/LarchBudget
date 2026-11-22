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

describe("explainAvailable's target", () => {
  const figures = { assigned: 0, activity: 0, available: 0 };

  it("is left out without a target", () => {
    expect(explainAvailable(figures).target).toBeUndefined();
    expect(explainAvailable({ ...figures, target: null }, "2026-11").target).toBeUndefined();
  });

  it("names the kind and the amount", () => {
    expect(
      explainAvailable({ ...figures, target: { kind: "topUp", amount: 40_000 } }, "2026-11").target,
    ).toEqual({ kind: "topUp", amount: 40_000 });
    expect(
      explainAvailable({ ...figures, target: { kind: "monthly", amount: 110_000 } }, "2026-11")
        .target,
    ).toEqual({ kind: "monthly", amount: 110_000 });
  });

  it("says whether the month of a by-a-month target has passed", () => {
    const target = { kind: "byMonth" as const, amount: 120_000, month: "2027-06" as const };
    const passed = (month: "2026-11" | "2027-06" | "2027-07") =>
      explainAvailable({ ...figures, target }, month).target;
    expect(passed("2026-11")).toEqual({ ...target, passed: false });
    expect(passed("2027-06")).toEqual({ ...target, passed: false });
    expect(passed("2027-07")).toEqual({ ...target, passed: true });
  });
});
