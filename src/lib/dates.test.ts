import { describe, expect, it } from "vitest";
import {
  addMonths,
  currentMonth,
  daysLeftInMonth,
  formatDate,
  formatDayMonth,
  formatMonth,
  isMonth,
  monthLabelParts,
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

describe("formatMonth", () => {
  it("names the month and year in the locale's words", () => {
    expect(formatMonth("2026-11", "en-US")).toBe("November 2026");
    expect(formatMonth("2026-03", "nl-NL")).toBe("maart 2026");
  });
});

describe("formatDate", () => {
  it("formats a calendar date without shifting it across time zones", () => {
    expect(formatDate("2026-11-03", "en-US")).toBe("Nov 3, 2026");
    expect(formatDate("2026-01-01", "en-GB")).toBe("1 Jan 2026");
  });
});

describe("formatDayMonth", () => {
  it("writes the day and the month in full, without the year, in the locale's order", () => {
    expect(formatDayMonth("2026-10-15", "en-US")).toBe("October 15");
    expect(formatDayMonth("2026-10-15", "en-GB")).toBe("15 October");
    expect(formatDayMonth("2027-01-14", "nl-NL")).toBe("14 januari");
  });
});
