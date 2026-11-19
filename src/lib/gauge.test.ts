import { describe, expect, it } from "vitest";
import { gaugeLevel } from "./gauge";

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
