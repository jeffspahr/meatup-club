import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventsPage from "./dashboard.events";
import type { Route } from "./+types/dashboard.events";

let navigationState: { state: string; formData: FormData | null } = {
  state: "idle",
  formData: null,
};

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, preventScrollReset, ...props }: any) => <form {...props}>{children}</form>,
    useNavigation: () => navigationState,
  };
});

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    formatDateForDisplay: vi.fn((value: string) => `formatted:${value}`),
    formatTimeForDisplay: vi.fn((value: string) => `time:${value}`),
  };
});

function renderEvents(
  loaderData: Route.ComponentProps["loaderData"],
  actionData?: Route.ComponentProps["actionData"]
) {
  return render(
    <EventsPage
      {...(({ loaderData, actionData } as unknown) as Route.ComponentProps)}
    />
  );
}

describe("dashboard.events UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState = { state: "idle", formData: null };
  });

  it("renders multiple upcoming events as separate collapsed tiles", () => {
    renderEvents({
      upcomingEvents: [
        {
          id: 1,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-06-20",
          event_time: "19:00",
          userRsvp: { status: "yes", comments: "I'll be there" },
          allRsvps: [],
          notResponded: [],
        },
        {
          id: 2,
          restaurant_name: "River Grill",
          restaurant_address: "99 Water St",
          event_date: "2026-07-10",
          event_time: "18:30",
          userRsvp: null,
          allRsvps: [],
          notResponded: [],
        },
      ],
      pastEvents: [],
    } as unknown as Route.ComponentProps["loaderData"]);

    expect(screen.getByText("2 upcoming events")).toBeInTheDocument();

    const firstTile = screen.getByRole("article", { name: "Prime Steakhouse" });
    const secondTile = screen.getByRole("article", { name: "River Grill" });

    expect(
      within(firstTile).getByRole("button", { name: "Open details for Prime Steakhouse" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      within(secondTile).getByRole("button", { name: "Open details for River Grill" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Your RSVP")).not.toBeInTheDocument();
  });

  it("reveals RSVP details inline and auto-submits radio changes", () => {
    const requestSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => undefined);

    renderEvents(
      {
        upcomingEvents: [
          {
            id: 1,
            restaurant_name: "Prime Steakhouse",
            restaurant_address: "123 Main St",
            event_date: "2026-06-20",
            event_time: "19:00",
            userRsvp: { status: "yes", comments: "I'll be there" },
            allRsvps: [
              {
                id: 10,
                user_id: 1,
                status: "yes",
                comments: "I'll be there",
                name: "You",
                email: "you@example.com",
                picture: null,
              },
              {
                id: 11,
                user_id: 2,
                status: "maybe",
                comments: null,
                name: "Alex",
                email: "alex@example.com",
                picture: null,
              },
              {
                id: 12,
                user_id: 3,
                status: "no",
                comments: "Out of town",
                name: "Sam",
                email: "sam@example.com",
                picture: null,
              },
            ],
            notResponded: [
              {
                id: 4,
                name: "Taylor",
                email: "taylor@example.com",
                picture: null,
              },
            ],
          },
        ],
        pastEvents: [
          {
            id: 2,
            restaurant_name: "Past Grill",
            event_date: "2026-05-01",
            event_time: "18:00",
            displayStatus: "completed",
          },
          {
            id: 3,
            restaurant_name: "Cancelled House",
            event_date: "2026-05-10",
            event_time: "18:30",
            displayStatus: "cancelled",
          },
        ],
      } as unknown as Route.ComponentProps["loaderData"],
      { error: "Missing required fields" } as unknown as Route.ComponentProps["actionData"]
    );

    expect(screen.getByText("Missing required fields")).toBeInTheDocument();
    const primeTile = screen.getByRole("article", { name: "Prime Steakhouse" });
    expect(within(primeTile).getByText("Your RSVP")).toBeInTheDocument();
    expect(within(primeTile).getByDisplayValue("I'll be there")).toBeInTheDocument();
    expect(within(primeTile).getByText("Taylor")).toBeInTheDocument();
    expect(screen.getByText("Past Grill")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Maybe" }));

    expect(requestSubmitSpy).toHaveBeenCalledTimes(1);

    requestSubmitSpy.mockRestore();
  });

  it("expands a selected event tile in place", () => {
    renderEvents({
      upcomingEvents: [
        {
          id: 1,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-06-20",
          event_time: "19:00",
          userRsvp: null,
          allRsvps: [],
          notResponded: [],
        },
        {
          id: 2,
          restaurant_name: "River Grill",
          restaurant_address: "99 Water St",
          event_date: "2026-07-10",
          event_time: "18:30",
          userRsvp: null,
          allRsvps: [],
          notResponded: [],
        },
      ],
      pastEvents: [],
    } as unknown as Route.ComponentProps["loaderData"]);

    const secondTile = screen.getByRole("article", { name: "River Grill" });

    fireEvent.click(within(secondTile).getByRole("button", { name: "Open details for River Grill" }));

    expect(
      within(secondTile).getByRole("button", { name: "Hide details for River Grill" })
    ).toHaveAttribute("aria-expanded", "true");
    expect(secondTile).toHaveClass("xl:col-span-2");
    expect(within(secondTile).getByText("Your RSVP")).toBeInTheDocument();
    expect(within(secondTile).getByLabelText("Comments (Optional)")).toBeInTheDocument();
  });

  it("renders empty states when there are no upcoming or past events", () => {
    renderEvents({
      upcomingEvents: [],
      pastEvents: [],
    } as unknown as Route.ComponentProps["loaderData"]);

    expect(screen.getByText("No upcoming events")).toBeInTheDocument();
    expect(screen.getByText("No past events yet")).toBeInTheDocument();
  });
});
