import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDateTimeForDisplay,
  formatTimeForDisplay,
  getAppTimeZone,
  getDateString,
  getEventDateTimeUtc,
  getTodayDateString,
  getTodayDateStringInTimeZone,
  getTodayDateStringLocal,
  getTodayDateStringUTC,
  isDateInPast,
  isDateInPastInTimeZone,
  isDateInPastUTC,
  isEventInPastInTimeZone,
  isDateTodayOrFuture,
  isDateTodayOrFutureInTimeZone,
  isDateTodayOrFutureUTC,
  parseLocalDate,
} from "./dateUtils";

describe("dateUtils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T03:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the configured app timezone or falls back to UTC", () => {
    expect(getAppTimeZone(" America/New_York ")).toBe("America/New_York");
    expect(getAppTimeZone("   ")).toBe("UTC");
    expect(getAppTimeZone(undefined)).toBe("UTC");
  });

  it("supports timezone-aware and UTC date comparisons", () => {
    expect(getTodayDateStringInTimeZone("America/New_York")).toBe("2026-03-06");
    expect(isDateInPastInTimeZone("2026-03-05", "America/New_York")).toBe(true);
    expect(isDateTodayOrFutureInTimeZone("2026-03-06", "America/New_York")).toBe(true);

    expect(getTodayDateStringUTC()).toBe("2026-03-07");
    expect(isDateInPastUTC("2026-03-06")).toBe(true);
    expect(isDateTodayOrFutureUTC("2026-03-07")).toBe(true);
  });

  it("covers local-date wrappers and backwards-compatible aliases", () => {
    const today = getTodayDateStringLocal();

    expect(getDateString(2026, 0, 9)).toBe("2026-01-09");
    expect(getTodayDateString()).toBe(today);
    expect(isDateInPast("1900-01-01")).toBe(true);
    expect(isDateTodayOrFuture("2999-01-01")).toBe(true);
  });

  it("parses local dates from prefixed timestamps and invalid input", () => {
    const timestampDate = parseLocalDate(" 2026-04-05T23:59:59Z ");
    const invalidDate = parseLocalDate("not-a-date");

    expect(timestampDate.getFullYear()).toBe(2026);
    expect(timestampDate.getMonth()).toBe(3);
    expect(timestampDate.getDate()).toBe(5);
    expect(Number.isNaN(invalidDate.getTime())).toBe(true);
  });

  it("formats time and datetime strings with both bare and ISO timestamps", () => {
    expect(formatTimeForDisplay("18:30", { hour: "numeric", minute: "2-digit", hour12: true })).toBe(
      "6:30 PM"
    );
    expect(formatDateTimeForDisplay("")).toBe("");
    expect(
      formatDateTimeForDisplay("2026-03-07 23:15:00", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    ).toBe("Mar 7, 2026");
    expect(
      formatDateTimeForDisplay("2026-03-07T23:15:00Z", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    ).toBe("Mar 7, 2026");
  });

  it("converts event datetimes to UTC with provided and default local times", () => {
    expect(getEventDateTimeUtc("2026-01-04", "18:30", "America/New_York").toISOString()).toBe(
      "2026-01-04T23:30:00.000Z"
    );
    expect(getEventDateTimeUtc("2026-07-04", null, "America/New_York").toISOString()).toBe(
      "2026-07-04T22:00:00.000Z"
    );
  });

  it.each([
    ["2026-03-08", "03:30", "2026-03-08T07:30:00.000Z"],
    ["2026-11-01", "03:30", "2026-11-01T08:30:00.000Z"],
  ])("uses the offset at the actual event instant for %s %s", (date, time, expected) => {
    expect(getEventDateTimeUtc(date, time, "America/New_York").toISOString()).toBe(expected);
  });

  it.each([
    ["2026-03-08", "2026-03-08T07:30:00Z"],
    ["2026-11-01", "2026-11-01T08:30:00Z"],
  ])("classifies %s events as past only after their actual start time", (date, utcTime) => {
    const start = new Date(utcTime).getTime();
    expect(isEventInPastInTimeZone(date, "03:30", "America/New_York", new Date(start - 1))).toBe(false);
    expect(isEventInPastInTimeZone(date, "03:30", "America/New_York", new Date(start))).toBe(false);
    expect(isEventInPastInTimeZone(date, "03:30", "America/New_York", new Date(start + 1))).toBe(true);
  });

  it("preserves existing choices for ambiguous and nonexistent local times", () => {
    expect(getEventDateTimeUtc("2026-11-01", "01:30", "America/New_York").toISOString())
      .toBe("2026-11-01T05:30:00.000Z");
    expect(getEventDateTimeUtc("2026-03-08", "02:30", "America/New_York").toISOString())
      .toBe("2026-03-08T07:30:00.000Z");
  });
});
