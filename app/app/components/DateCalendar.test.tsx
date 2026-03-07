import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DateCalendar } from "./DateCalendar";

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    getTodayDateStringLocal: vi.fn(() => "2026-04-15"),
    isDateInPastLocal: vi.fn((dateString: string) => dateString < "2026-04-15"),
  };
});

describe("DateCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onDateClick with the selected current-month date", () => {
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "20" }));

    expect(onDateClick).toHaveBeenCalledWith("2026-04-20");
  });

  it("maps previous-month trailing days to the previous month", () => {
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    fireEvent.click(screen.getByTitle("Next month"));

    const previousMonthButton = screen
      .getAllByTitle("Click to add this date (Previous month)")
      .find(button => button.textContent === "30");
    expect(previousMonthButton).toBeDefined();
    fireEvent.click(previousMonthButton!);

    expect(onDateClick).toHaveBeenCalledWith("2026-04-30");
  });

  it("disables past dates with no existing user interaction after hydration", async () => {
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    await act(async () => {});

    expect(screen.getByRole("button", { name: "10" })).toBeDisabled();
  });

  it("navigates between months and returns to today", () => {
    render(
      <DateCalendar
        suggestions={[]}
        activePollId={1}
        currentUserId={123}
        onDateClick={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "April 2026" })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Next month"));
    expect(screen.getByRole("heading", { name: "May 2026" })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Previous month"));
    expect(screen.getByRole("heading", { name: "April 2026" })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Next month"));
    fireEvent.click(screen.getByTitle("Next month"));
    expect(screen.getByRole("heading", { name: "June 2026" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("heading", { name: "April 2026" })).toBeInTheDocument();
  });

  it("maps previous-year trailing days to December when the calendar starts in January", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[
          {
            id: 99,
            suggested_date: "2025-12-31",
            vote_count: 1,
            user_has_voted: 1,
            poll_id: 1,
            user_id: 999,
          },
        ]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    const previousYearButton = screen
      .getAllByTitle("Past date")
      .find(
        button =>
          button.textContent?.startsWith("31") &&
          !button.hasAttribute("disabled")
      );
    expect(previousYearButton).toBeDefined();

    fireEvent.click(previousYearButton!);

    expect(onDateClick).toHaveBeenCalledWith("2025-12-31");
  });

  it("maps next-year overflow days to January when the calendar ends in December", () => {
    vi.setSystemTime(new Date(2026, 11, 15, 12, 0, 0));
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    const nextYearButton = screen
      .getAllByTitle("Click to add this date (Next month)")
      .find(button => button.textContent === "1");
    expect(nextYearButton).toBeDefined();

    fireEvent.click(nextYearButton!);

    expect(onDateClick).toHaveBeenCalledWith("2027-01-01");
  });

  it("keeps a past date interactive when the current user already voted for it", async () => {
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[
          {
            id: 8,
            suggested_date: "2026-04-08",
            vote_count: 2,
            user_has_voted: 1,
            poll_id: 1,
            user_id: 999,
          },
        ]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    await act(async () => {});

    const button = screen
      .getAllByTitle("Past date")
      .find(currentButton => !currentButton.hasAttribute("disabled"));
    expect(button).toHaveTextContent("8");
    expect(button).toBeEnabled();

    fireEvent.click(button!);

    expect(onDateClick).toHaveBeenCalledWith("2026-04-08");
  });
});
