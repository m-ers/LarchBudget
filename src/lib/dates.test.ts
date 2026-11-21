import { describe, expect, it } from "vitest";
import {
  addMonths,
  currentMonth,
  daysLeftInMonth,
  formatDate,
  formatMonth,
  formatMonthShort,
  isMonth,
  monthLabelParts,
  monthName,
  monthsBetween,
  today,
} from "./dates";

describe("isMonth", () => {
  it("accepts YYYY-MM only", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-1")).toBe(false);
    expect(isMonth("2026-11-01")).toBe(false);
    expect(isMonth(undefined)).toBe(false);
  });
});

describe("addMonths", () => {
  it("crosses year boundaries in both directions", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", -15)).toBe("2024-12");
  });
});

describe("monthsBetween", () => {
  it("counts the months from one to another, across years and backwards", () => {
    expect(monthsBetween("2026-11", "2026-11")).toBe(0);
    expect(monthsBetween("2026-11", "2027-06")).toBe(7);
    expect(monthsBetween("2026-12", "2027-01")).toBe(1);
    expect(monthsBetween("2027-01", "2026-12")).toBe(-1);
  });
});

describe("today and currentMonth", () => {
  it("use the local calendar date", () => {
    const now = new Date(2026, 0, 5, 23, 30);
    expect(today(now)).toBe("2026-01-05");
    expect(currentMonth(now)).toBe("2026-01");
  });
});

describe("daysLeftInMonth", () => {
  it("counts the days after today in the current month", () => {
    expect(daysLeftInMonth("2026-11", new Date(2026, 10, 19))).toBe(11);
    expect(daysLeftInMonth("2026-11", new Date(2026, 10, 30))).toBe(0);
    expect(daysLeftInMonth("2028-02", new Date(2028, 1, 1))).toBe(28);
  });

  it("is null for any other month", () => {
    expect(daysLeftInMonth("2026-10", new Date(2026, 10, 19))).toBeNull();
    expect(daysLeftInMonth("2026-12", new Date(2026, 10, 19))).toBeNull();
  });
});

describe("monthLabelParts", () => {
  it("keeps the year as its own part", () => {
    const parts = monthLabelParts("2026-11", "en-US");
    expect(parts.map((p) => p.value).join("")).toBe("November 2026");
    expect(parts.find((p) => p.type === "year")?.value).toBe("2026");
    expect(
      monthLabelParts("2026-03", "nl-NL")
        .map((p) => p.value)
        .join(""),
    ).toBe("maart 2026");
  });
});

describe("monthName", () => {
  it("is the month's name without the year", () => {
    expect(monthName("2026-11", "en-US")).toBe("November");
    expect(monthName("2027-01", "en-US")).toBe("January");
    expect(monthName("2026-10", "nl-NL")).toBe("oktober");
  });
});

describe("formatMonth", () => {
  it("names the month and year in the locale's words", () => {
    expect(formatMonth("2026-11", "en-US")).toBe("November 2026");
    expect(formatMonth("2026-03", "nl-NL")).toBe("maart 2026");
  });
});

describe("formatMonthShort", () => {
  it("writes the month in fewer letters, in the language", () => {
    expect(formatMonthShort("2027-06", "en-US")).toBe("Jun 2027");
    expect(formatMonthShort("2027-03", "nl-NL")).toBe("mrt 2027");
  });
});

describe("formatDate", () => {
  it("formats a calendar date without shifting it across time zones", () => {
    expect(formatDate("2026-11-03", "en-US")).toBe("Nov 3, 2026");
    expect(formatDate("2026-01-01", "en-GB")).toBe("1 Jan 2026");
  });
});
