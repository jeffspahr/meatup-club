import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage, { HydrateFallback } from "./dashboard._index";
import type { Route } from "./+types/dashboard._index";

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    formatDateForDisplay: vi.fn((value: string) => `formatted:${value}`),
    formatTimeForDisplay: vi.fn((value: string) => `time:${value}`),
  };
});

function createStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function renderDashboard(loaderData: Route.ComponentProps["loaderData"]) {
  return render(
    <MemoryRouter>
      <DashboardPage
        {...(({ loaderData } as unknown) as Route.ComponentProps)}
      />
    </MemoryRouter>
  );
}

describe("dashboard._index UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = createStorageMock();
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
  });

  it("expands first-visit content, prompts for SMS signup, and lets the user dismiss both", async () => {
    renderDashboard({
      user: {
        id: 123,
        name: "Jeff Example",
        email: "jeff@example.com",
        phone_number: null,
      },
      memberCount: 12,
      isAdmin: false,
      activePoll: {
        id: 7,
        title: "May Poll",
        created_at: "2026-05-01T12:00:00.000Z",
      },
      topRestaurants: [
        { name: "Prime Steakhouse", vote_count: 2 },
        { name: "Oak Room", vote_count: 2 },
      ],
      topDates: [{ suggested_date: "2026-05-20", vote_count: 3 }],
      nextEvent: {
        id: 11,
        restaurant_name: "Prime Steakhouse",
        event_date: "2026-05-20",
        event_time: "19:00",
      },
      userRsvp: null,
      content: [
        {
          id: 1,
          key: "description",
          title: "Club Notes",
          content: "**Quarterly** meetup details",
        },
      ],
      userRestaurantVote: null,
      userDateVoteCount: 0,
    } as unknown as Route.ComponentProps["loaderData"]);

    expect(
      await screen.findByText("Get SMS reminders + RSVP by text")
    ).toBeInTheDocument();
    expect(await screen.findByText("Club Notes")).toBeInTheDocument();
    expect(window.localStorage.getItem("hasVisitedDashboard")).toBe("true");

    expect(screen.getByText("Tied: Prime Steakhouse, Oak Room")).toBeInTheDocument();
    expect(screen.getByText("formatted:2026-05-20")).toBeInTheDocument();
    expect(screen.getAllByText("Vote now →")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Set RSVP →" })).toHaveAttribute(
      "href",
      "/dashboard/events"
    );
    expect(screen.getByText("Action Needed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => {
      expect(screen.queryByText("Get SMS reminders + RSVP by text")).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem("dismissedSmsPrompt")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Hide Details" }));
    expect(screen.queryByText("Club Notes")).not.toBeInTheDocument();
  });

  it("renders the returning-admin view with no active poll and an existing RSVP", async () => {
    window.localStorage.setItem("hasVisitedDashboard", "true");

    renderDashboard({
      user: {
        id: 1,
        name: "Alex Admin",
        email: "alex@example.com",
        phone_number: "+15551234567",
      },
      memberCount: 18,
      isAdmin: true,
      activePoll: null,
      topRestaurants: [],
      topDates: [],
      nextEvent: {
        id: 12,
        restaurant_name: "Future House",
        event_date: "2026-06-01",
        event_time: "18:30",
      },
      userRsvp: { status: "yes" },
      content: [
        {
          id: 2,
          key: "description",
          title: "Welcome Copy",
          content: "Members only details",
        },
      ],
      userRestaurantVote: null,
      userDateVoteCount: 0,
    } as unknown as Route.ComponentProps["loaderData"]);

    expect(screen.queryByText("Get SMS reminders + RSVP by text")).not.toBeInTheDocument();
    expect(screen.getByText("No Active Poll")).toBeInTheDocument();
    expect(
      screen.getByText("Start a new poll to begin voting on the next meetup location and date.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start New Poll" })).toHaveAttribute(
      "href",
      "/dashboard/admin/polls"
    );
    expect(screen.getByText("Going")).toBeInTheDocument();
    expect(screen.getByText("Update your response")).toBeInTheDocument();
    expect(screen.getByText("Admin Panel")).toBeInTheDocument();
    expect(screen.queryByText("Welcome Copy")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show Details" }));
    expect(await screen.findByText("Welcome Copy")).toBeInTheDocument();
  });

  it("renders the route hydrate fallback shell", () => {
    const { container } = render(<HydrateFallback />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });
});
