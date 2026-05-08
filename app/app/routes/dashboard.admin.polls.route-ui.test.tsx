import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPollsPage, { loader } from "./dashboard.admin.polls";
import type { Route } from "./+types/dashboard.admin.polls";
import { requireActiveUser } from "../lib/auth.server";
import { getActivePollLeaders } from "../lib/polls.server";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  };
});

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/polls.server", () => ({
  getActivePollLeaders: vi.fn(),
}));

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    formatDateForDisplay: vi.fn((value: string) => `formatted:${value}`),
    formatDateTimeForDisplay: vi.fn((value: string) => `datetime:${value}`),
  };
});

vi.mock("../components/VoteLeadersCard", () => ({
  default: ({
    topRestaurant,
    topDate,
    variant,
  }: {
    topRestaurant: { name: string } | null;
    topDate: { suggested_date: string } | null;
    variant?: string;
  }) => (
    <div data-testid="vote-leaders-card">
      <span>{variant}</span>
      <span>{topRestaurant?.name ?? "no-restaurant"}</span>
      <span>{topDate?.suggested_date ?? "no-date"}</span>
    </div>
  ),
}));

type MockDbOptions = {
  restaurants?: Array<Record<string, unknown>>;
  dates?: Array<Record<string, unknown>>;
  closedPolls?: Array<Record<string, unknown>>;
};

function createMockDb({
  restaurants = [],
  dates = [],
  closedPolls = [],
}: MockDbOptions = {}) {
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const allForArgs = async () => {
      if (normalizedSql.includes("FROM restaurants r")) {
        return { results: restaurants };
      }

      if (normalizedSql.includes("FROM date_suggestions ds")) {
        return { results: dates };
      }

      if (normalizedSql.includes("FROM polls p")) {
        return { results: closedPolls };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    return {
      all: () => allForArgs(),
      bind: (..._bindArgs: unknown[]) => ({
        all: () => allForArgs(),
      }),
    };
  });

  return { prepare };
}

describe("dashboard.admin.polls loader and UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin User",
    } as never);
    vi.mocked(getActivePollLeaders).mockResolvedValue({
      activePoll: {
        id: 10,
        title: "June Poll",
        status: "active",
        start_date: null,
        end_date: null,
        winning_restaurant_id: null,
        winning_date_id: null,
        created_event_id: null,
        created_by: 1,
        closed_by: null,
        created_at: "2026-05-01T00:00:00.000Z",
        closed_at: null,
      },
      topRestaurant: {
        id: 100,
        name: "Prime Steakhouse",
        address: "123 Main St",
        vote_count: 4,
      },
      topDate: {
        id: 200,
        suggested_date: "2026-06-20",
        vote_count: 5,
      },
    });
  });

  it("redirects non-admin users back to the dashboard", async () => {
    vi.mocked(requireActiveUser).mockResolvedValueOnce({
      id: 2,
      is_admin: 0,
      status: "active",
      email: "member@example.com",
      name: "Member",
    } as never);

    const response = await loader({
      request: new Request("http://localhost/dashboard/admin/polls"),
      context: { cloudflare: { env: { DB: createMockDb() } } } as never,
      params: {},
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard");
  });

  it("loads active poll leaders, dropdown options, and recent closed polls for admins", async () => {
    const db = createMockDb({
      restaurants: [
        { id: 100, name: "Prime Steakhouse", address: "123 Main St", vote_count: 4 },
        { id: 101, name: "Ocean Grill", address: "9 Dock St", vote_count: 2 },
      ],
      dates: [
        { id: 200, suggested_date: "2026-06-20", vote_count: 5 },
        { id: 201, suggested_date: "2026-06-27", vote_count: 3 },
      ],
      closedPolls: [
        {
          id: 9,
          title: "May Poll",
          closed_at: "2026-05-10T12:00:00.000Z",
          closed_by_name: "Admin User",
          winning_restaurant_name: "Prime Steakhouse",
          winning_date: "2026-05-20",
          event_id: 77,
        },
      ],
    });

    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/polls"),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);
    const loaderData = result as Exclude<Awaited<ReturnType<typeof loader>>, Response>;

    expect(getActivePollLeaders).toHaveBeenCalledWith(db as never);
    expect(loaderData.activePoll).toEqual(expect.objectContaining({ id: 10, title: "June Poll" }));
    expect(loaderData.allRestaurants).toEqual([
      expect.objectContaining({ id: 100, name: "Prime Steakhouse" }),
      expect.objectContaining({ id: 101, name: "Ocean Grill" }),
    ]);
    expect(loaderData.allDates).toEqual([
      expect.objectContaining({ id: 200, suggested_date: "2026-06-20" }),
      expect.objectContaining({ id: 201, suggested_date: "2026-06-27" }),
    ]);
    expect(loaderData.closedPolls).toEqual([
      expect.objectContaining({ id: 9, title: "May Poll", event_id: 77 }),
    ]);
  });

  it("renders the active-poll close form with leader defaults and closed history", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin/polls"]}>
        <AdminPollsPage
          {...(({
            loaderData: {
              activePoll: {
                id: 10,
                title: "June Poll",
                created_at: "2026-05-01T00:00:00.000Z",
              },
              topRestaurant: {
                id: 100,
                name: "Prime Steakhouse",
                address: "123 Main St",
                vote_count: 4,
              },
              topDate: {
                id: 200,
                suggested_date: "2026-06-20",
                vote_count: 5,
              },
              allRestaurants: [
                { id: 100, name: "Prime Steakhouse", address: "123 Main St", vote_count: 4 },
                { id: 101, name: "Ocean Grill", address: "9 Dock St", vote_count: 2 },
              ],
              allDates: [
                { id: 200, suggested_date: "2026-06-20", vote_count: 5 },
                { id: 201, suggested_date: "2026-06-27", vote_count: 3 },
              ],
              closedPolls: [
                {
                  id: 9,
                  title: "May Poll",
                  closed_at: "2026-05-10T12:00:00.000Z",
                  closed_by_name: "Admin User",
                  winning_restaurant_name: "Prime Steakhouse",
                  winning_date: "2026-05-20",
                  event_id: 77,
                },
              ],
            },
            actionData: { error: "Something went wrong." },
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(screen.getByText("June Poll")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("formatted:2026-05-01T00:00:00.000Z"))).toBeInTheDocument();
    expect(screen.getByTestId("vote-leaders-card")).toHaveTextContent("amber");

    const restaurantSelect = document.querySelector('select[name="winning_restaurant_id"]');
    const dateSelect = document.querySelector('select[name="winning_date_id"]');

    expect(restaurantSelect).not.toBeNull();
    expect(dateSelect).not.toBeNull();
    expect(restaurantSelect as unknown as HTMLSelectElement).toHaveValue("100");
    expect(dateSelect as unknown as HTMLSelectElement).toHaveValue("200");
    expect(screen.getByLabelText("Create event from winners")).toBeChecked();
    expect(screen.getByLabelText("Send calendar invites to all members")).toBeChecked();
    const eventTimeInput = document.querySelector('input[name="event_time"]');
    expect(eventTimeInput).not.toBeNull();
    expect(eventTimeInput as HTMLInputElement).toHaveValue("18:00");
    expect(
      screen.getByText((content) => content.includes("datetime:2026-05-10T12:00:00.000Z"))
    ).toBeInTheDocument();
    expect(screen.getByText("formatted:2026-05-20")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Created Event →" })).toHaveAttribute(
      "href",
      "/dashboard/admin/events"
    );
  });

  it("renders a close-only form when an active poll has no winners", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin/polls"]}>
        <AdminPollsPage
          {...(({
            loaderData: {
              activePoll: {
                id: 10,
                title: "June Poll",
                created_at: "2026-05-01T00:00:00.000Z",
              },
              topRestaurant: null,
              topDate: null,
              allRestaurants: [],
              allDates: [],
              closedPolls: [],
            },
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("June Poll")).toBeInTheDocument();
    expect(screen.getByTestId("vote-leaders-card")).toHaveTextContent("no-restaurant");
    expect(screen.getByText("No winners yet. Closing this poll will not create an event.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Poll Without Winners" })).toBeInTheDocument();
    expect(document.querySelector('input[name="_action"]')).toHaveValue("close");
    expect(document.querySelector('input[name="poll_id"]')).toHaveValue("10");
    expect(document.querySelector('select[name="winning_restaurant_id"]')).toBeNull();
    expect(document.querySelector('select[name="winning_date_id"]')).toBeNull();
    expect(screen.queryByLabelText("Create event from winners")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Send calendar invites to all members")).not.toBeInTheDocument();
    expect(document.querySelector('input[name="event_time"]')).toBeNull();
  });

  describe("close poll confirmation dialog", () => {
    let confirmMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      confirmMock = vi.fn().mockReturnValue(true);
      vi.stubGlobal("confirm", confirmMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function getCloseForm(): HTMLFormElement {
      const closeAction = document.querySelector(
        'input[name="_action"][value="close"]'
      );
      const form = closeAction?.closest("form");
      if (!(form instanceof HTMLFormElement)) {
        throw new Error("close form not found");
      }
      return form;
    }

    function renderWithLeaders() {
      return render(
        <MemoryRouter initialEntries={["/dashboard/admin/polls"]}>
          <AdminPollsPage
            {...(({
              loaderData: {
                activePoll: {
                  id: 10,
                  title: "June Poll",
                  created_at: "2026-05-01T00:00:00.000Z",
                },
                topRestaurant: {
                  id: 100,
                  name: "Prime Steakhouse",
                  address: "123 Main St",
                  vote_count: 4,
                },
                topDate: {
                  id: 200,
                  suggested_date: "2026-06-20",
                  vote_count: 5,
                },
                allRestaurants: [
                  { id: 100, name: "Prime Steakhouse", address: "123 Main St", vote_count: 4 },
                  { id: 101, name: "Ocean Grill", address: "9 Dock St", vote_count: 2 },
                ],
                allDates: [
                  { id: 200, suggested_date: "2026-06-20", vote_count: 5 },
                  { id: 201, suggested_date: "2026-06-27", vote_count: 3 },
                ],
                closedPolls: [],
              },
              actionData: undefined,
            } as unknown) as Route.ComponentProps)}
          />
        </MemoryRouter>
      );
    }

    function renderWithoutLeaders() {
      return render(
        <MemoryRouter initialEntries={["/dashboard/admin/polls"]}>
          <AdminPollsPage
            {...(({
              loaderData: {
                activePoll: {
                  id: 10,
                  title: "June Poll",
                  created_at: "2026-05-01T00:00:00.000Z",
                },
                topRestaurant: null,
                topDate: null,
                allRestaurants: [],
                allDates: [],
                closedPolls: [],
              },
              actionData: undefined,
            } as unknown) as Route.ComponentProps)}
          />
        </MemoryRouter>
      );
    }

    it("confirms with a no-winner message when closing a poll without leaders", () => {
      renderWithoutLeaders();

      fireEvent.submit(getCloseForm());

      expect(confirmMock).toHaveBeenCalledTimes(1);
      const message = confirmMock.mock.calls[0][0];
      expect(message).toContain('Close poll "June Poll" with no winner?');
      expect(message).toContain("This cannot be undone.");
      expect(message).not.toContain("Winning restaurant");
      expect(message).not.toContain("event will be created");
    });

    it("confirms with winner details when closing a poll with leaders and default options", () => {
      renderWithLeaders();

      fireEvent.submit(getCloseForm());

      expect(confirmMock).toHaveBeenCalledTimes(1);
      const message = confirmMock.mock.calls[0][0];
      expect(message).toContain('Close poll "June Poll"?');
      expect(message).toContain("Winning restaurant: Prime Steakhouse");
      expect(message).toContain("Winning date: formatted:2026-06-20");
      expect(message).toContain("An event will be created at 6:00 PM.");
      expect(message).toContain("All active members will be sent calendar invites.");
      expect(message).toContain("This cannot be undone.");
    });

    it("reflects unchecked event creation and invite options in the confirmation", () => {
      renderWithLeaders();

      const createEventCheckbox = screen.getByLabelText("Create event from winners") as HTMLInputElement;
      const sendInvitesCheckbox = screen.getByLabelText(
        "Send calendar invites to all members"
      ) as HTMLInputElement;
      fireEvent.click(createEventCheckbox);
      fireEvent.click(sendInvitesCheckbox);

      fireEvent.submit(getCloseForm());

      const message = confirmMock.mock.calls[0][0];
      expect(message).toContain("No event will be created.");
      expect(message).toContain("Members will not be notified.");
      expect(message).not.toContain("An event will be created at");
      expect(message).not.toContain("All active members will be sent");
    });

    it("prevents form submission when the admin cancels the confirmation", () => {
      confirmMock.mockReturnValue(false);
      renderWithoutLeaders();

      const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
      getCloseForm().dispatchEvent(submitEvent);

      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(submitEvent.defaultPrevented).toBe(true);
    });
  });

  it("renders the create-poll form and empty history state when no poll is active", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin/polls"]}>
        <AdminPollsPage
          {...(({
            loaderData: {
              activePoll: null,
              topRestaurant: null,
              topDate: null,
              allRestaurants: [],
              allDates: [],
              closedPolls: [],
            },
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Start New Poll" })).toBeInTheDocument();
    expect(screen.getByLabelText("Poll Title")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create Poll" })).toBeInTheDocument();
    expect(screen.getByText("No closed polls yet.")).toBeInTheDocument();
  });
});
