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
  it("filters past votes, shows the current user, and recalculates vote totals from visible votes", async () => {
    render(
      <DoodleView
        currentUserId={2}
        onVoteToggle={vi.fn()}
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

  it("lets the current user toggle only their own row cells", async () => {
    const onVoteToggle = vi.fn();

    render(
      <DoodleView
        currentUserId={2}
        onVoteToggle={onVoteToggle}
        dateSuggestions={[
          { id: 2, suggested_date: "2026-04-20", vote_count: 99 },
          { id: 3, suggested_date: "2026-04-22", vote_count: 99 },
        ]}
        dateVotes={[
          {
            date_suggestion_id: 2,
            user_id: 1,
            suggested_date: "2026-04-20",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
          {
            date_suggestion_id: 3,
            user_id: 1,
            suggested_date: "2026-04-22",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
          {
            date_suggestion_id: 2,
            user_id: 2,
            suggested_date: "2026-04-20",
            user_name: "Current User",
            user_email: "current@example.com",
          },
        ]}
      />
    );

    await screen.findByText("Availability Grid");

    fireEvent.click(screen.getByRole("button", { name: "Vote for Apr 22" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove your vote for Apr 20" }));

    expect(onVoteToggle).toHaveBeenNthCalledWith(1, 3, false);
    expect(onVoteToggle).toHaveBeenNthCalledWith(2, 2, true);

    const otherUserRow = screen.getByText("Alice").closest("tr");
    expect(otherUserRow).not.toBeNull();
    expect(within(otherUserRow as HTMLTableRowElement).queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when there are no future voted dates", async () => {
    const { container } = render(
      <DoodleView
        currentUserId={2}
        onVoteToggle={vi.fn()}
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
