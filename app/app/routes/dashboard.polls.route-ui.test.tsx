import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PollsPage from "./dashboard.polls";
import type { Route } from "./+types/dashboard.polls";

const submitSpy = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    useSubmit: () => submitSpy,
  };
});

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    formatDateForDisplay: vi.fn((value: string) => `formatted-date:${value}`),
    formatDateTimeForDisplay: vi.fn((value: string) => `formatted-datetime:${value}`),
  };
});

vi.mock("../components/DateCalendar", () => ({
  DateCalendar: ({ onDateClick }: { onDateClick: (date: string) => void }) => (
    <div>
      <button type="button" onClick={() => onDateClick("2026-06-10")}>
        Calendar new date
      </button>
      <button type="button" onClick={() => onDateClick("2026-06-11")}>
        Calendar add vote
      </button>
      <button type="button" onClick={() => onDateClick("2026-06-12")}>
        Calendar remove vote
      </button>
      <button type="button" onClick={() => onDateClick("2026-06-13")}>
        Calendar delete owned
      </button>
    </div>
  ),
}));

vi.mock("../components/DoodleView", () => ({
  DoodleView: ({
    onVoteToggle,
  }: {
    onVoteToggle: (suggestionId: number, remove: boolean) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onVoteToggle(21, false)}>
        Doodle add vote
      </button>
      <button type="button" onClick={() => onVoteToggle(22, true)}>
        Doodle remove vote
      </button>
    </div>
  ),
}));

vi.mock("../components/AddRestaurantModal", () => ({
  AddRestaurantModal: ({
    isOpen,
    onClose,
    onSubmit,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (details: Record<string, unknown>) => void;
  }) =>
    isOpen ? (
      <div>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              placeId: "place-123",
              name: "Prime Steakhouse",
              address: "123 Main St",
              cuisine: "Steakhouse",
              photoUrl: "https://images.example.com/prime.jpg",
            })
          }
        >
          Modal submit
        </button>
        <button type="button" onClick={onClose}>
          Modal close
        </button>
      </div>
    ) : null,
}));

vi.mock("../components/CommentSection", () => ({
  CommentSection: ({
    comments,
    placeholder,
  }: {
    comments: unknown[];
    placeholder: string;
  }) => (
    <div>
      <p>{placeholder}</p>
      <p>Comment count: {comments.length}</p>
    </div>
  ),
}));

function renderPolls(
  loaderData: Route.ComponentProps["loaderData"],
  actionData?: Route.ComponentProps["actionData"]
) {
  return render(
    <PollsPage
      {...(({ loaderData, actionData } as unknown) as Route.ComponentProps)}
    />
  );
}

describe("dashboard.polls UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitSpy.mockReset();
  });

  it("renders the no-active-poll state, previous poll winners, and route errors", () => {
    renderPolls(
      {
        dateSuggestions: [],
        restaurantSuggestions: [],
        activePoll: null,
        previousPolls: [
          {
            id: 44,
            title: "Spring Poll",
            description: "Closed vote",
            closed_at: "2026-04-01T12:00:00.000Z",
            winner_restaurant: "Prime Steakhouse",
            winner_date: "2026-04-20",
          },
        ],
        dateVotes: [],
        comments: [],
        currentUser: { id: 123, isAdmin: false },
      } as unknown as Route.ComponentProps["loaderData"],
      { error: "Invalid action" } as Route.ComponentProps["actionData"]
    );

    expect(screen.getByText("Invalid action")).toBeInTheDocument();
    expect(screen.getByText("No active poll at the moment")).toBeInTheDocument();
    expect(screen.getByText("Spring Poll")).toBeInTheDocument();
    expect(screen.getByText("Closed formatted-datetime:2026-04-01T12:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("Prime Steakhouse")).toBeInTheDocument();
    expect(screen.getByText("formatted-date:2026-04-20")).toBeInTheDocument();
    expect(screen.queryByText("Share your thoughts about this poll...")).not.toBeInTheDocument();
  });

  it("submits date, doodle, restaurant, and comment-section route interactions for an active poll", () => {
    renderPolls({
      dateSuggestions: [
        {
          id: 21,
          user_id: 999,
          suggested_date: "2026-06-11",
          user_has_voted: 0,
        },
        {
          id: 22,
          user_id: 999,
          suggested_date: "2026-06-12",
          user_has_voted: 1,
        },
        {
          id: 23,
          user_id: 123,
          suggested_date: "2026-06-13",
          user_has_voted: 1,
        },
      ],
      restaurantSuggestions: [
        {
          id: 55,
          name: "Prime Steakhouse",
          address: "123 Main St",
          cuisine: "Steakhouse",
          vote_count: 4,
          user_has_voted: 1,
          suggested_by_name: "Alex",
          suggested_by_email: "alex@example.com",
          photo_url: "https://images.example.com/prime.jpg",
        },
      ],
      activePoll: {
        id: 12,
        title: "June Poll",
        description: "Pick the next meetup",
      },
      previousPolls: [],
      dateVotes: [{ date_suggestion_id: 21, user_id: 123 }],
      comments: [{ id: 1, content: "Looks good", replies: [] }],
      currentUser: { id: 123, isAdmin: false },
    } as unknown as Route.ComponentProps["loaderData"]);

    expect(screen.getByText("Pick the next meetup")).toBeInTheDocument();
    expect(screen.getByText("Share your thoughts about this poll...")).toBeInTheDocument();
    expect(screen.getByText("Comment count: 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Calendar new date" }));
    fireEvent.click(screen.getByRole("button", { name: "Calendar add vote" }));
    fireEvent.click(screen.getByRole("button", { name: "Calendar remove vote" }));
    fireEvent.click(screen.getByRole("button", { name: "Calendar delete owned" }));
    fireEvent.click(screen.getByRole("button", { name: "Doodle add vote" }));
    fireEvent.click(screen.getByRole("button", { name: "Doodle remove vote" }));

    fireEvent.click(screen.getByRole("button", { name: /\+ Add Restaurant/i }));
    fireEvent.click(screen.getByRole("button", { name: "Modal submit" }));
    fireEvent.click(screen.getByText("Prime Steakhouse"));

    expect(submitSpy).toHaveBeenCalledTimes(8);
    expect((submitSpy.mock.calls[0][0] as FormData).get("_action")).toBe("suggest_date");
    expect((submitSpy.mock.calls[0][0] as FormData).get("suggested_date")).toBe("2026-06-10");
    expect((submitSpy.mock.calls[1][0] as FormData).get("_action")).toBe("vote_date");
    expect((submitSpy.mock.calls[1][0] as FormData).get("suggestion_id")).toBe("21");
    expect((submitSpy.mock.calls[1][0] as FormData).get("remove")).toBe("false");
    expect((submitSpy.mock.calls[2][0] as FormData).get("_action")).toBe("vote_date");
    expect((submitSpy.mock.calls[2][0] as FormData).get("suggestion_id")).toBe("22");
    expect((submitSpy.mock.calls[2][0] as FormData).get("remove")).toBe("true");
    expect((submitSpy.mock.calls[3][0] as FormData).get("_action")).toBe("delete_date");
    expect((submitSpy.mock.calls[3][0] as FormData).get("suggestion_id")).toBe("23");
    expect((submitSpy.mock.calls[4][0] as FormData).get("_action")).toBe("vote_date");
    expect((submitSpy.mock.calls[4][0] as FormData).get("suggestion_id")).toBe("21");
    expect((submitSpy.mock.calls[4][0] as FormData).get("remove")).toBe("false");
    expect((submitSpy.mock.calls[5][0] as FormData).get("_action")).toBe("vote_date");
    expect((submitSpy.mock.calls[5][0] as FormData).get("suggestion_id")).toBe("22");
    expect((submitSpy.mock.calls[5][0] as FormData).get("remove")).toBe("true");
    expect((submitSpy.mock.calls[6][0] as FormData).get("_action")).toBe("suggest_restaurant");
    expect((submitSpy.mock.calls[6][0] as FormData).get("place_id")).toBe("place-123");
    expect((submitSpy.mock.calls[7][0] as FormData).get("_action")).toBe("vote_restaurant");
    expect((submitSpy.mock.calls[7][0] as FormData).get("suggestion_id")).toBe("55");
  });
});
