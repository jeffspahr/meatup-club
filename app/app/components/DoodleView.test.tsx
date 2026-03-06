import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DoodleView } from "./DoodleView";

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    isDateInPastLocal: vi.fn((dateString: string) => dateString < "2026-04-15"),
  };
});

describe("DoodleView", () => {
  it("filters past votes, shows the current user, and recalculates vote totals from future votes", async () => {
    render(
      <DoodleView
        currentUserId={2}
        dateSuggestions={[
          { id: 1, suggested_date: "2026-04-10", vote_count: 99 },
          { id: 2, suggested_date: "2026-04-20", vote_count: 99 },
          { id: 3, suggested_date: "2026-04-22", vote_count: 1 },
        ]}
        dateVotes={[
          {
            date_suggestion_id: 1,
            user_id: 3,
            suggested_date: "2026-04-10",
            user_name: "Past Only",
            user_email: "past@example.com",
          },
          {
            date_suggestion_id: 2,
            user_id: 1,
            suggested_date: "2026-04-20",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
          {
            date_suggestion_id: 2,
            user_id: 2,
            suggested_date: "2026-04-20",
            user_name: null,
            user_email: "current@example.com",
          },
        ]}
      />
    );

    await screen.findByText("Availability Grid");

    expect(screen.getByText("Apr 20")).toBeInTheDocument();
    expect(screen.queryByText("Apr 10")).not.toBeInTheDocument();
    expect(screen.queryByText("Past Only")).not.toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();

    const currentUserRow = screen.getByText("current@example.com").closest("tr");
    expect(currentUserRow).not.toBeNull();
    expect(within(currentUserRow as HTMLTableRowElement).getByText("1")).toBeInTheDocument();

    const totalsRow = screen.getByText("Total Votes").closest("tr");
    expect(totalsRow).not.toBeNull();
    expect(within(totalsRow as HTMLTableRowElement).getByText("2")).toBeInTheDocument();
  });

  it("shows only the top two vote tiers by default, preserves hidden-date voters, and toggles to all dates", async () => {
    render(
      <DoodleView
        currentUserId={2}
        dateSuggestions={[
          { id: 1, suggested_date: "2026-04-20", vote_count: 999 },
          { id: 2, suggested_date: "2026-04-21", vote_count: 999 },
          { id: 3, suggested_date: "2026-04-22", vote_count: 999 },
          { id: 4, suggested_date: "2026-04-23", vote_count: 999 },
        ]}
        dateVotes={[
          {
            date_suggestion_id: 1,
            user_id: 1,
            suggested_date: "2026-04-20",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
          {
            date_suggestion_id: 1,
            user_id: 2,
            suggested_date: "2026-04-20",
            user_name: null,
            user_email: "current@example.com",
          },
          {
            date_suggestion_id: 1,
            user_id: 3,
            suggested_date: "2026-04-20",
            user_name: "Cara",
            user_email: "cara@example.com",
          },
          {
            date_suggestion_id: 2,
            user_id: 1,
            suggested_date: "2026-04-21",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
          {
            date_suggestion_id: 2,
            user_id: 2,
            suggested_date: "2026-04-21",
            user_name: null,
            user_email: "current@example.com",
          },
          {
            date_suggestion_id: 3,
            user_id: 4,
            suggested_date: "2026-04-22",
            user_name: "Hidden Only",
            user_email: "hidden@example.com",
          },
          {
            date_suggestion_id: 4,
            user_id: 1,
            suggested_date: "2026-04-23",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
        ]}
      />
    );

    await screen.findByText("Availability Grid");

    expect(screen.getByRole("button", { name: "Show all dates (4)" })).toBeInTheDocument();
    expect(screen.getByText("Apr 20")).toBeInTheDocument();
    expect(screen.getByText("Apr 21")).toBeInTheDocument();
    expect(screen.queryByText("Apr 22")).not.toBeInTheDocument();
    expect(screen.queryByText("Apr 23")).not.toBeInTheDocument();

    const hiddenOnlyRow = screen.getByText("Hidden Only").closest("tr");
    expect(hiddenOnlyRow).not.toBeNull();
    expect(within(hiddenOnlyRow as HTMLTableRowElement).getByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all dates (4)" }));

    expect(screen.getByRole("button", { name: "Show top dates (2)" })).toBeInTheDocument();
    expect(screen.getByText("Apr 22")).toBeInTheDocument();
    expect(screen.getByText("Apr 23")).toBeInTheDocument();

    const totalsRow = screen.getByText("Total Votes").closest("tr");
    expect(totalsRow).not.toBeNull();
    expect(within(totalsRow as HTMLTableRowElement).getByText("3")).toBeInTheDocument();
    expect(within(totalsRow as HTMLTableRowElement).getAllByText("1")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Show top dates (2)" }));

    expect(screen.getByRole("button", { name: "Show all dates (4)" })).toBeInTheDocument();
    expect(screen.queryByText("Apr 22")).not.toBeInTheDocument();
    expect(screen.queryByText("Apr 23")).not.toBeInTheDocument();
  });

  it("does not render a toggle when all future dates are already within the top two vote tiers", async () => {
    render(
      <DoodleView
        currentUserId={1}
        dateSuggestions={[
          { id: 1, suggested_date: "2026-04-20", vote_count: 0 },
          { id: 2, suggested_date: "2026-04-21", vote_count: 0 },
          { id: 3, suggested_date: "2026-04-22", vote_count: 0 },
        ]}
        dateVotes={[
          {
            date_suggestion_id: 1,
            user_id: 1,
            suggested_date: "2026-04-20",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
          {
            date_suggestion_id: 1,
            user_id: 2,
            suggested_date: "2026-04-20",
            user_name: "Bob",
            user_email: "bob@example.com",
          },
          {
            date_suggestion_id: 2,
            user_id: 1,
            suggested_date: "2026-04-21",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
          {
            date_suggestion_id: 2,
            user_id: 2,
            suggested_date: "2026-04-21",
            user_name: "Bob",
            user_email: "bob@example.com",
          },
          {
            date_suggestion_id: 3,
            user_id: 1,
            suggested_date: "2026-04-22",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
        ]}
      />
    );

    await screen.findByText("Availability Grid");

    expect(screen.queryByRole("button", { name: /Show (all|top) dates/ })).not.toBeInTheDocument();
    expect(screen.getByText("Apr 20")).toBeInTheDocument();
    expect(screen.getByText("Apr 21")).toBeInTheDocument();
    expect(screen.getByText("Apr 22")).toBeInTheDocument();
  });

  it("renders nothing when there are no future voted dates", async () => {
    const { container } = render(
      <DoodleView
        currentUserId={2}
        dateSuggestions={[{ id: 1, suggested_date: "2026-04-10", vote_count: 3 }]}
        dateVotes={[
          {
            date_suggestion_id: 1,
            user_id: 2,
            suggested_date: "2026-04-10",
            user_name: "Current User",
            user_email: "current@example.com",
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText("Availability Grid")).not.toBeInTheDocument();
    });

    expect(container).toBeEmptyDOMElement();
  });
});
