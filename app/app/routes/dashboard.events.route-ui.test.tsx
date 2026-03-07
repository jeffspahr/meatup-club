import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventsPage from "./dashboard.events";
import type { Route } from "./+types/dashboard.events";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
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
  });

  it("renders RSVP states, attendee groups, past-event badges, and auto-submit radio changes", () => {
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
      } as Route.ComponentProps["loaderData"],
      { error: "Missing required fields" } as Route.ComponentProps["actionData"]
    );

    expect(screen.getByText("Missing required fields")).toBeInTheDocument();
    expect(screen.getByText("Prime Steakhouse")).toBeInTheDocument();
    expect(screen.getByText("RSVPs (1 yes, 1 maybe, 1 no, 1 pending)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("I'll be there")).toBeInTheDocument();
    expect(screen.getByText("Taylor")).toBeInTheDocument();
    expect(screen.getByText("Past Grill")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Maybe" }));

    expect(requestSubmitSpy).toHaveBeenCalledTimes(1);

    requestSubmitSpy.mockRestore();
  });

  it("renders empty states when there are no upcoming or past events", () => {
    renderEvents({
      upcomingEvents: [],
      pastEvents: [],
    } as Route.ComponentProps["loaderData"]);

    expect(screen.getByText("No upcoming events")).toBeInTheDocument();
    expect(screen.getByText("No past events yet")).toBeInTheDocument();
  });
});
