import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventsPage, { ErrorBoundary, HydrateFallback } from "./dashboard.events";
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
    const tilesGrid = firstTile.parentElement;

    expect(
      within(firstTile).getByRole("button", { name: "Open details for Prime Steakhouse" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      within(secondTile).getByRole("button", { name: "Open details for River Grill" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(tilesGrid).toHaveClass("xl:auto-rows-fr");
    expect(firstTile).toHaveClass("h-full");
    expect(secondTile).toHaveClass("h-full");
    expect(firstTile.firstElementChild).toHaveClass("h-full", "flex", "flex-col");
    expect(secondTile.firstElementChild).toHaveClass("h-full", "flex", "flex-col");
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

  it("shows the next upcoming summary and lets the user edit a past event inline", () => {
    renderEvents({
      upcomingEvents: [
        {
          id: 1,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-06-20",
          event_time: "19:00",
          canEdit: true,
          creatorLabel: "Created by you",
          userRsvp: { status: "yes", comments: null },
          allRsvps: [],
          notResponded: [],
        },
      ],
      pastEvents: [
        {
          id: 2,
          restaurant_name: "Past Grill",
          restaurant_address: "9 Water St",
          event_date: "2026-05-01",
          event_time: "18:00",
          displayStatus: "completed",
          canEdit: true,
          creatorLabel: "Created by you",
        },
      ],
    } as unknown as Route.ComponentProps["loaderData"]);

    expect(screen.getByText("Next up")).toBeInTheDocument();
    expect(screen.getAllByText("Created by you")).toHaveLength(2);

    const pastTile = screen.getByRole("article", { name: "Past Grill" });
    fireEvent.click(within(pastTile).getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("heading", { name: "Edit Event" })).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Past Grill")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    expect(screen.queryByRole("heading", { name: "Edit Event" })).not.toBeInTheDocument();
  });

  it("renders empty states when there are no upcoming or past events", () => {
    renderEvents({
      upcomingEvents: [],
      pastEvents: [],
    } as unknown as Route.ComponentProps["loaderData"]);

    expect(screen.getByText("No upcoming events")).toBeInTheDocument();
    expect(screen.getByText("No past events yet")).toBeInTheDocument();
  });

  it("toggles the create form, updates draft values, and resets them when cancelled", () => {
    renderEvents({
      upcomingEvents: [],
      pastEvents: [],
    } as unknown as Route.ComponentProps["loaderData"]);

    fireEvent.click(screen.getByRole("button", { name: "+ Create Ad Hoc Event" }));

    const dateInput = screen.getByLabelText("Event Date *") as HTMLInputElement;
    const timeInput = screen.getByLabelText("Event Time") as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: "2026-08-12" } });
    fireEvent.change(timeInput, { target: { value: "19:45" } });

    expect(dateInput.value).toBe("2026-08-12");
    expect(timeInput.value).toBe("19:45");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Create Ad Hoc Event" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ Create Ad Hoc Event" }));

    expect((screen.getByLabelText("Event Date *") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Event Time") as HTMLInputElement).value).toBe("18:00");
  });

  it("closes the create form after a successful create submission cycle", () => {
    const loaderData = {
      upcomingEvents: [],
      pastEvents: [],
    } as unknown as Route.ComponentProps["loaderData"];

    const { rerender } = renderEvents(loaderData);

    fireEvent.click(screen.getByRole("button", { name: "+ Create Ad Hoc Event" }));
    expect(screen.getByRole("heading", { name: "Create Ad Hoc Event" })).toBeInTheDocument();

    navigationState = {
      state: "submitting",
      formData: (() => {
        const formData = new FormData();
        formData.set("_action", "create");
        return formData;
      })(),
    };
    rerender(
      <EventsPage
        {...(({ loaderData } as unknown) as Route.ComponentProps)}
      />
    );

    navigationState = { state: "idle", formData: null };
    rerender(
      <EventsPage
        {...(({ loaderData } as unknown) as Route.ComponentProps)}
      />
    );

    expect(screen.queryByRole("heading", { name: "Create Ad Hoc Event" })).not.toBeInTheDocument();
  });

  it("closes inline editing after a successful update submission cycle", () => {
    const loaderData = {
      upcomingEvents: [
        {
          id: 1,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-06-20",
          event_time: "19:00",
          canEdit: true,
          creatorLabel: "Created by you",
          userRsvp: null,
          allRsvps: [],
          notResponded: [],
        },
      ],
      pastEvents: [],
    } as unknown as Route.ComponentProps["loaderData"];

    const { rerender } = renderEvents(loaderData);

    fireEvent.click(screen.getByRole("button", { name: "Edit Prime Steakhouse" }));
    expect(screen.getByRole("heading", { name: "Edit Event" })).toBeInTheDocument();

    navigationState = {
      state: "submitting",
      formData: (() => {
        const formData = new FormData();
        formData.set("_action", "update");
        return formData;
      })(),
    };
    rerender(
      <EventsPage
        {...(({ loaderData } as unknown) as Route.ComponentProps)}
      />
    );

    navigationState = { state: "idle", formData: null };
    rerender(
      <EventsPage
        {...(({ loaderData } as unknown) as Route.ComponentProps)}
      />
    );

    expect(screen.queryByRole("heading", { name: "Edit Event" })).not.toBeInTheDocument();
  });

  it("renders maybe and out RSVP badges with fallback creator labels", () => {
    renderEvents({
      upcomingEvents: [
        {
          id: 1,
          restaurant_name: "River Grill",
          restaurant_address: null,
          event_date: "2026-06-20",
          event_time: "19:00",
          canEdit: false,
          creatorLabel: "Created by admin@example.com",
          userRsvp: { status: "maybe", comments: null },
          allRsvps: [],
          notResponded: [],
        },
      ],
      pastEvents: [
        {
          id: 2,
          restaurant_name: "Closed House",
          restaurant_address: null,
          event_date: "2026-05-01",
          event_time: "18:00",
          displayStatus: "cancelled",
          canEdit: false,
          creatorLabel: "Created by an admin",
        },
      ],
    } as unknown as Route.ComponentProps["loaderData"]);

    expect(screen.getAllByText("You're maybe").length).toBeGreaterThan(0);
    expect(screen.getByText("Created by admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("Created by an admin")).toBeInTheDocument();
  });

  it("renders the loading fallback and route error boundary states", () => {
    const { rerender } = render(<HydrateFallback />);

    expect(screen.getByText("Upcoming and past Meatup.Club events")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ErrorBoundary
          {...(({ error: new Error("calendar exploded") } as unknown) as Route.ErrorBoundaryProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Something went wrong loading events.")).toBeInTheDocument();
    expect(screen.getByText("calendar exploded")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ErrorBoundary
          {...(({
            error: {
              status: 503,
              statusText: "Service Unavailable",
              data: null,
              internal: false,
            },
          } as unknown) as Route.ErrorBoundaryProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Unable to load events (503)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });
});
