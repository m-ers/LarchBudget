import { describe, expect, it } from "vitest";
import { addMonths, type IsoDate, type Month } from "./dates";
import { receivedPeriod } from "./income";

/** Which of the months around a date's own month its money counts as received in. */
function countsIn(date: IsoDate, countsForNextMonth: boolean): Month[] {
  const own = date.slice(0, 7) as Month;
  return [-1, 0, 1, 2]
    .map((delta) => addMonths(own, delta))
    .filter((month) => {
      const { first, last } = receivedPeriod(month, countsForNextMonth);
      return first <= date && date <= last;
    });
}

describe("receivedPeriod", () => {
  it("is the calendar month for a category that counts for its own month", () => {
    expect(receivedPeriod("2026-11", false)).toEqual({ first: "2026-11-01", last: "2026-11-30" });
    expect(receivedPeriod("2026-12", false)).toEqual({ first: "2026-12-01", last: "2026-12-31" });
    expect(receivedPeriod("2027-01", false)).toEqual({ first: "2027-01-01", last: "2027-01-31" });
    expect(receivedPeriod("2026-02", false)).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(receivedPeriod("2028-02", false)).toEqual({ first: "2028-02-01", last: "2028-02-29" });
  });

  it("runs from the 15th of the month before to the 14th for one that counts for the next month", () => {
    expect(receivedPeriod("2026-11", true)).toEqual({ first: "2026-10-15", last: "2026-11-14" });
    expect(receivedPeriod("2026-03", true)).toEqual({ first: "2026-02-15", last: "2026-03-14" });
  });

  it("crosses the turn of the year", () => {
    expect(receivedPeriod("2027-01", true)).toEqual({ first: "2026-12-15", last: "2027-01-14" });
    expect(receivedPeriod("2026-12", true)).toEqual({ first: "2026-11-15", last: "2026-12-14" });
  });

  it("moves money from the 15th on to the next month, and keeps the 14th in its own", () => {
    expect(countsIn("2026-10-14", true)).toEqual(["2026-10"]);
    expect(countsIn("2026-10-15", true)).toEqual(["2026-11"]);
    // A salary on the 23rd, 25th or 31st, or one that slips to the 1st.
    for (const date of ["2026-10-23", "2026-10-25", "2026-10-31", "2026-11-01"] as const) {
      expect(countsIn(date, true)).toEqual(["2026-11"]);
    }
    expect(countsIn("2026-12-15", true)).toEqual(["2027-01"]);
    expect(countsIn("2026-12-31", true)).toEqual(["2027-01"]);
    expect(countsIn("2027-01-14", true)).toEqual(["2027-01"]);
  });

  it("keeps every day in its own month when switched off", () => {
    for (const date of ["2026-10-14", "2026-10-15", "2026-10-31", "2026-12-31"] as const) {
      expect(countsIn(date, false)).toEqual([date.slice(0, 7)]);
    }
  });

  it("counts every day in exactly one month, switched on or off", () => {
    for (const on of [true, false]) {
      for (let day = new Date(Date.UTC(2026, 0, 1)); day.getUTCFullYear() < 2029;) {
        const date = day.toISOString().slice(0, 10) as IsoDate;
        expect(countsIn(date, on), date).toHaveLength(1);
        day = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      }
    }
  });
});
