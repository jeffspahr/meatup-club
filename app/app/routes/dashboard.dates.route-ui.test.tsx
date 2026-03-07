import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DatesPage, { loader } from "./dashboard.dates";
import { requireActiveUser } from "../lib/auth.server";
import { confirmAction } from "../lib/confirm.client";

const submitSpy = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    useSubmit: () => submitSpy,
  };
});

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/confirm.client", () => ({
  confirmAction: vi.fn(() => true),
}));

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    formatDateForDisplay: vi.fn((value: string) => `formatted:${value}`),
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

type MockDbOptions = {
  activePoll?: Record<string, unknown> | null;
  suggestions?: Array<Record<string, unknown>>;
};

function createMockDb({
  activePoll = {
    id: 12,
    title: "June Poll",
    created_at: "2026-05-01T12:00:00.000Z",
  },
  suggestions = [],
}: MockDbOptions = {}) {
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql.includes("SELECT * FROM polls WHERE status = 'active'")) {
        return activePoll;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql.includes("FROM date_suggestions ds")) {
        return { results: suggestions };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    return {
      first: () => firstForArgs([]),
      all: () => allForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: () => allForArgs(bindArgs),
      }),
    };
  });

  return { prepare };
}

describe("dashboard.dates loader and UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitSpy.mockReset();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "user@example.com",
      name: "User",
    } as never);
  });

  it("loads active-poll date suggestions and current-user flags", async () => {
    const db = createMockDb({
      suggestions: [
        {
          id: 1,
          user_id: 123,
          poll_id: 12,
          suggested_date: "2026-06-13",
          suggested_by_name: "User",
          suggested_by_email: "user@example.com",
          vote_count: 2,
          user_has_voted: 1,
        },
      ],
    });

    const result = await loader({
      request: new Request("http://localhost/dashboard/dates"),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(requireActiveUser).toHaveBeenCalled();
    expect(result.activePoll).toEqual(expect.objectContaining({ id: 12, title: "June Poll" }));
    expect(result.currentUser).toEqual({ id: 123, isAdmin: false });
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        id: 1,
        suggested_date: "2026-06-13",
        vote_count: 2,
        user_has_voted: 1,
      }),
    ]);
  });

  it("renders the no-poll state and disables the suggest button", () => {
    render(
      <DatesPage
        loaderData={{
          suggestions: [],
          activePoll: null,
          currentUser: { id: 123, isAdmin: false },
        }}
        actionData={{ error: "Something went wrong." }}
      />
    );

    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(
      screen.getByText("No active poll. An admin must start one before voting can begin.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Suggest Date/i })).toBeDisabled();
    expect(
      screen.getByText("Start a poll to begin suggesting and voting on dates.")
    ).toBeInTheDocument();
  });

  it("shows the admin-specific no-poll message and ignores calendar clicks without an active poll", () => {
    render(
      <DatesPage
        loaderData={{
          suggestions: [],
          activePoll: null,
          currentUser: { id: 123, isAdmin: true },
        }}
        actionData={undefined}
      />
    );

    expect(
      screen.getByText("No active poll. Start one from Admin Polls to begin voting on dates.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Calendar new date" }));

    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("toggles the suggest form and resets its state on cancel", () => {
    render(
      <DatesPage
        loaderData={{
          suggestions: [],
          activePoll: { id: 12, title: "June Poll", created_at: "2026-05-01T12:00:00.000Z" },
          currentUser: { id: 123, isAdmin: false },
        }}
        actionData={undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ Suggest Date/i }));
    expect(screen.getByRole("heading", { name: "Suggest a Date" })).toBeInTheDocument();

    const input = screen.getByLabelText("Proposed Date *");
    fireEvent.change(input, { target: { value: "2026-06-20" } });
    expect(input).toHaveValue("2026-06-20");

    fireEvent.click(screen.getAllByRole("button", { name: /^Cancel$/i })[1]!);
    expect(screen.queryByRole("heading", { name: "Suggest a Date" })).not.toBeInTheDocument();
  });

  it("opens the empty-state suggest action and clears the form after submit", () => {
    const { container } = render(
      <DatesPage
        loaderData={{
          suggestions: [],
          activePoll: { id: 12, title: "June Poll", created_at: "2026-05-01T12:00:00.000Z" },
          currentUser: { id: 123, isAdmin: false },
        }}
        actionData={undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^Suggest Date$/i }));
    expect(screen.getByRole("heading", { name: "Suggest a Date" })).toBeInTheDocument();

    const input = screen.getByLabelText("Proposed Date *");
    fireEvent.change(input, { target: { value: "2026-06-21" } });
    expect(input).toHaveValue("2026-06-21");

    fireEvent.submit(container.querySelector("form")!);

    expect(screen.queryByRole("heading", { name: "Suggest a Date" })).not.toBeInTheDocument();
  });

  it("submits suggest, vote-add, vote-remove, and delete actions from calendar and list interactions", () => {
    render(
      <DatesPage
        loaderData={{
          suggestions: [
            {
              id: 11,
              user_id: 999,
              poll_id: 12,
              suggested_date: "2026-06-11",
              suggested_by_name: "Alex",
              suggested_by_email: "alex@example.com",
              vote_count: 2,
              user_has_voted: 0,
            },
            {
              id: 12,
              user_id: 999,
              poll_id: 12,
              suggested_date: "2026-06-12",
              suggested_by_name: "Jordan",
              suggested_by_email: "jordan@example.com",
              vote_count: 3,
              user_has_voted: 1,
            },
            {
              id: 13,
              user_id: 123,
              poll_id: 12,
              suggested_date: "2026-06-13",
              suggested_by_name: "User",
              suggested_by_email: "user@example.com",
              vote_count: 1,
              user_has_voted: 1,
            },
          ],
          activePoll: { id: 12, title: "June Poll", created_at: "2026-05-01T12:00:00.000Z" },
          currentUser: { id: 123, isAdmin: false },
        }}
        actionData={undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Calendar new date" }));
    fireEvent.click(screen.getByRole("button", { name: "Calendar add vote" }));
    fireEvent.click(screen.getByRole("button", { name: "Calendar remove vote" }));
    fireEvent.click(screen.getByRole("button", { name: "Calendar delete owned" }));

    expect(submitSpy).toHaveBeenCalledTimes(4);
    expect((submitSpy.mock.calls[0][0] as FormData).get("_action")).toBe("suggest");
    expect((submitSpy.mock.calls[0][0] as FormData).get("suggested_date")).toBe("2026-06-10");
    expect((submitSpy.mock.calls[1][0] as FormData).get("_action")).toBe("vote");
    expect((submitSpy.mock.calls[1][0] as FormData).get("suggestion_id")).toBe("11");
    expect((submitSpy.mock.calls[1][0] as FormData).get("remove")).toBe("false");
    expect((submitSpy.mock.calls[2][0] as FormData).get("_action")).toBe("vote");
    expect((submitSpy.mock.calls[2][0] as FormData).get("suggestion_id")).toBe("12");
    expect((submitSpy.mock.calls[2][0] as FormData).get("remove")).toBe("true");
    expect((submitSpy.mock.calls[3][0] as FormData).get("_action")).toBe("delete");
    expect((submitSpy.mock.calls[3][0] as FormData).get("suggestion_id")).toBe("13");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmAction).toHaveBeenCalled();
    expect((submitSpy.mock.calls[4][0] as FormData).get("_action")).toBe("delete");
  });

  it("submits vote actions from the list and respects declined delete confirmations", () => {
    vi.mocked(confirmAction).mockReturnValue(false);

    render(
      <DatesPage
        loaderData={{
          suggestions: [
            {
              id: 11,
              user_id: 999,
              poll_id: 12,
              suggested_date: "2026-06-11",
              suggested_by_name: "Alex",
              suggested_by_email: "alex@example.com",
              vote_count: 2,
              user_has_voted: 0,
            },
            {
              id: 13,
              user_id: 123,
              poll_id: 12,
              suggested_date: "2026-06-13",
              suggested_by_name: "User",
              suggested_by_email: "user@example.com",
              vote_count: 1,
              user_has_voted: 1,
            },
          ],
          activePoll: { id: 12, title: "June Poll", created_at: "2026-05-01T12:00:00.000Z" },
          currentUser: { id: 123, isAdmin: false },
        }}
        actionData={undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Vote" }));

    expect((submitSpy.mock.calls[0][0] as FormData).get("_action")).toBe("vote");
    expect((submitSpy.mock.calls[0][0] as FormData).get("suggestion_id")).toBe("11");
    expect((submitSpy.mock.calls[0][0] as FormData).get("remove")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmAction).toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
