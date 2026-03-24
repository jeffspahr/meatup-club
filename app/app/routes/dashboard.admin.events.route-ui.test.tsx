import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminEventsPage, { action, loader } from "./dashboard.admin.events";
import type { Route } from "./+types/dashboard.admin.events";
import { requireAdmin } from "../lib/auth.server";
import { getActivePollLeaders } from "../lib/polls.server";
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  getAppTimeZone,
  isEventInPastInTimeZone,
} from "../lib/dateUtils";
import { sendAdhocSmsReminder } from "../lib/sms.server";

let navigationState: { state: string; formData: FormData | null } = {
  state: "idle",
  formData: null,
};
const submitSpy = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    useNavigation: () => navigationState,
    useSubmit: () => submitSpy,
  };
});

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/polls.server", () => ({
  getActivePollLeaders: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../lib/sms.server", () => ({
  sendAdhocSmsReminder: vi.fn(),
}));

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    formatDateForDisplay: vi.fn((value: string) => `formatted:${value}`),
    formatTimeForDisplay: vi.fn((value: string) => `time:${value}`),
    getAppTimeZone: vi.fn(() => "America/New_York"),
    isEventInPastInTimeZone: vi.fn((eventDate: string) => eventDate < "2026-05-01"),
  };
});

type MockDbOptions = {
  events?: Array<Record<string, unknown>>;
  smsMembers?: Array<Record<string, unknown>>;
  rsvpRows?: Array<Record<string, unknown>>;
  activeMembers?: Array<Record<string, unknown>>;
  eventForLookup?: Record<string, unknown> | null;
  eventForDelete?: Record<string, unknown> | null;
};

function createMockDb({
  events = [],
  smsMembers = [],
  rsvpRows = [],
  activeMembers = [],
  eventForLookup = {
    id: 42,
    restaurant_name: "Prime Steakhouse",
    restaurant_address: "123 Main St",
    event_date: "2026-05-20",
    event_time: "18:00",
    status: "upcoming",
    calendar_sequence: 4,
    created_by: 1,
  },
  eventForDelete = {
    id: 42,
    restaurant_name: "Prime Steakhouse",
    restaurant_address: "123 Main St",
    event_date: "2026-05-20",
    event_time: "18:00",
    calendar_sequence: 4,
  },
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const isSelectStatement = normalizedSql.startsWith("SELECT");

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (
        normalizedSql ===
        "SELECT id, restaurant_name, restaurant_address, event_date, event_time, status, calendar_sequence, created_by FROM events WHERE id = ?"
      ) {
        return eventForLookup;
      }

      if (
        normalizedSql === "SELECT id, restaurant_name, event_date, event_time FROM events WHERE id = ?" ||
        normalizedSql ===
          "SELECT id, restaurant_name, restaurant_address, event_date, event_time FROM events WHERE id = ?"
      ) {
        return eventForLookup;
      }

      if (
        normalizedSql ===
        "SELECT id, restaurant_name, restaurant_address, event_date, event_time, calendar_sequence FROM events WHERE id = ?"
      ) {
        return eventForDelete;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql === "SELECT * FROM events ORDER BY event_date DESC") {
        return { results: events };
      }

      if (normalizedSql.includes("FROM users WHERE status = 'active'") && normalizedSql.includes("sms_opt_in = 1")) {
        return { results: smsMembers };
      }

      if (normalizedSql.includes("FROM rsvps r JOIN users u ON r.user_id = u.id")) {
        return { results: rsvpRows };
      }

      if (normalizedSql === "SELECT id, name, email FROM users WHERE status = ? ORDER BY name ASC, email ASC") {
        return { results: activeMembers };
      }

      if (normalizedSql.includes("FROM event_email_deliveries") && normalizedSql.includes("latest_delivery_type")) {
        return { results: [] };
      }

      if (normalizedSql === "SELECT id FROM event_email_deliveries WHERE batch_id = ? ORDER BY id ASC") {
        return { results: [{ id: 21 }, { id: 22 }] };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });
      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstForArgs([]),
      all: () => allForArgs([]),
      ...(isSelectStatement ? {} : { run: () => runForArgs([]) }),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: () => allForArgs(bindArgs),
        ...(isSelectStatement ? {} : { run: () => runForArgs(bindArgs) }),
      }),
    };
  });

  const batch = vi.fn(async (statements: Array<{ run?: () => Promise<unknown>; all?: () => Promise<unknown> }>) => {
    const results = [];

    for (const statement of statements) {
      if (typeof statement.run === "function") {
        results.push(await statement.run());
        continue;
      }

      if (typeof statement.all === "function") {
        results.push(await statement.all());
        continue;
      }

      throw new Error("Unexpected statement without run/all handler");
    }

    return results;
  });

  return { prepare, batch, runCalls };
}

function createRequest(formEntries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/dashboard/admin/events", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.admin.events loader and UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState = { state: "idle", formData: null };
    submitSpy.mockReset();
    vi.unstubAllGlobals();

    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin User",
    } as never);
    vi.mocked(getActivePollLeaders).mockResolvedValue({
      topRestaurant: {
        id: 5,
        name: "Prime Steakhouse",
        address: "123 Main St",
        vote_count: 4,
      },
      topDate: {
        id: 8,
        suggested_date: "2026-05-20",
        vote_count: 5,
      },
      activePoll: null,
    });
    vi.mocked(sendAdhocSmsReminder).mockResolvedValue({ sent: 2, errors: [] });
  });

  it("loads events with display statuses, vote leaders, and RSVP member lookup data", async () => {
    const db = createMockDb({
      events: [
        {
          id: 3,
          restaurant_name: "Cancelled Steakhouse",
          restaurant_address: "3 Main St",
          event_date: "2026-06-01",
          event_time: "19:00",
          status: "cancelled",
          created_at: "2026-03-01",
        },
        {
          id: 2,
          restaurant_name: "Past Grill",
          restaurant_address: "2 Main St",
          event_date: "2026-04-10",
          event_time: "18:00",
          status: "upcoming",
          created_at: "2026-03-02",
        },
        {
          id: 1,
          restaurant_name: "Future House",
          restaurant_address: "1 Main St",
          event_date: "2026-05-20",
          event_time: "18:30",
          status: "upcoming",
          created_at: "2026-03-03",
        },
      ],
      smsMembers: [{ id: 10, name: "Alice", email: "alice@example.com" }],
      rsvpRows: [
        {
          event_id: 1,
          user_id: 10,
          status: "yes",
          admin_override: 1,
          name: "Alice",
          email: "alice@example.com",
        },
      ],
      activeMembers: [
        { id: 10, name: "Alice", email: "alice@example.com" },
        { id: 11, name: "Bob", email: "bob@example.com" },
      ],
    });

    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/events"),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "America/New_York" } } } as never,
      params: {},
    } as never);

    expect(requireAdmin).toHaveBeenCalled();
    expect(getAppTimeZone).toHaveBeenCalledWith("America/New_York");
    expect(isEventInPastInTimeZone).toHaveBeenCalledWith("2026-04-10", "18:00", "America/New_York");
    expect(getActivePollLeaders).toHaveBeenCalledWith(db as never);

    expect(result.events).toEqual([
      expect.objectContaining({ id: 3, displayStatus: "cancelled" }),
      expect.objectContaining({ id: 2, displayStatus: "completed" }),
      expect.objectContaining({ id: 1, displayStatus: "upcoming" }),
    ]);
    expect(result.smsMembers).toEqual([{ id: 10, name: "Alice", email: "alice@example.com" }]);
    expect(result.eventMembersById[1]).toEqual([
      expect.objectContaining({ id: 10, rsvp_status: "yes", admin_override: 1 }),
      expect.objectContaining({ id: 11, rsvp_status: null, admin_override: 0 }),
    ]);
    expect(result.topRestaurant).toEqual(expect.objectContaining({ name: "Prime Steakhouse" }));
    expect(result.topDate).toEqual(expect.objectContaining({ suggested_date: "2026-05-20" }));
  });

  it("renders the empty state, action feedback, and create form toggle", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData: {
              events: [],
              topRestaurant: null,
              topDate: null,
              smsMembers: [],
              eventMembersById: {},
            },
            actionData: { success: "Saved successfully." },
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Saved successfully.")).toBeInTheDocument();
    expect(screen.getByText("No events created yet")).toBeInTheDocument();
    expect(screen.queryByText("Create New Event")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\+ Create Event/i }));

    expect(screen.getByRole("heading", { name: "Create New Event" })).toBeInTheDocument();
    expect(screen.getByLabelText("Restaurant *")).toHaveValue("");
    expect(screen.getByLabelText("Send calendar invites to all active members")).toBeChecked();
  });

  it("renders event controls for editing, SMS recipient filtering, RSVP overrides, and delete submit", () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);

    render(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData: {
              events: [
                {
                  id: 42,
                  restaurant_name: "Prime Steakhouse",
                  restaurant_address: "123 Main St",
                  event_date: "2026-05-20",
                  event_time: "18:00",
                  status: "upcoming",
                  displayStatus: "upcoming",
                  created_at: "2026-03-01",
                },
              ],
              topRestaurant: {
                id: 5,
                name: "Prime Steakhouse",
                address: "123 Main St",
                vote_count: 4,
              },
              topDate: {
                id: 8,
                suggested_date: "2026-05-20",
                vote_count: 5,
              },
              smsMembers: [{ id: 7, name: "Pat Member", email: "pat@example.com" }],
              eventMembersById: {
                42: [
                  {
                    id: 7,
                    name: "Pat Member",
                    email: "pat@example.com",
                    rsvp_status: "yes",
                    admin_override: 1,
                    hasAcceptedCalendarDelivery: false,
                    hasDeliveredCalendarDelivery: false,
                    lastCalendarDeliveryStatus: null,
                    lastCalendarDeliveryType: null,
                  },
                ],
              },
            },
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Prefill from Vote Leaders" })).toBeInTheDocument();
    expect(screen.getAllByText("Prime Steakhouse")).toHaveLength(2);
    expect(screen.getAllByText("123 Main St")).toHaveLength(2);
    expect(screen.getByText("formatted:2026-05-20")).toBeInTheDocument();
    expect(formatTimeForDisplay).toHaveBeenCalledWith("18:00");
    expect(screen.getAllByText("Admin override")).toHaveLength(2);
    expect(screen.getByText("Current RSVP: yes")).toBeInTheDocument();

    const recipientScope = document.querySelector('select[name="recipient_scope"]');
    expect(recipientScope).not.toBeNull();
    fireEvent.change(recipientScope as unknown as HTMLSelectElement, { target: { value: "specific" } });

    expect(screen.getByText("Specific Recipient")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pat Member" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getAllByDisplayValue("Prime Steakhouse")).toHaveLength(2);
    expect(screen.getByDisplayValue("123 Main St")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-05-20")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to delete the event "Prime Steakhouse" on formatted:2026-05-20? This action cannot be undone.'
    );
    expect(submitSpy).toHaveBeenCalledTimes(1);
    const [formData, options] = submitSpy.mock.calls[0];
    expect((formData as FormData).get("_action")).toBe("delete");
    expect((formData as FormData).get("id")).toBe("42");
    expect(options).toEqual({ method: "post" });
  });

  it("renders calendar resend delivery history badges for missing, retrying, and delivered members", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData: {
              events: [
                {
                  id: 42,
                  restaurant_name: "Prime Steakhouse",
                  restaurant_address: "123 Main St",
                  event_date: "2026-05-20",
                  event_time: "18:00",
                  status: "upcoming",
                  displayStatus: "upcoming",
                  created_at: "2026-03-01",
                },
              ],
              topRestaurant: null,
              topDate: null,
              smsMembers: [],
              eventMembersById: {
                42: [
                  {
                    id: 7,
                    name: "Retry Member",
                    email: "retry@example.com",
                    rsvp_status: null,
                    admin_override: 0,
                    hasAcceptedCalendarDelivery: false,
                    hasDeliveredCalendarDelivery: false,
                    lastCalendarDeliveryStatus: "retry",
                    lastCalendarDeliveryType: "update",
                  },
                  {
                    id: 8,
                    name: "Delivered Member",
                    email: "delivered@example.com",
                    rsvp_status: "yes",
                    admin_override: 1,
                    hasAcceptedCalendarDelivery: true,
                    hasDeliveredCalendarDelivery: true,
                    lastCalendarDeliveryStatus: "delivered",
                    lastCalendarDeliveryType: "invite",
                  },
                ],
              },
            },
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Calendar Resend")).toBeInTheDocument();
    expect(screen.getByText("Currently missing: 1 of 2 active members.")).toBeInTheDocument();
    expect(screen.getByText("Retrying")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getByText("Latest calendar email: update / retry")).toBeInTheDocument();
    expect(screen.getByText("Latest calendar email: invite / delivered")).toBeInTheDocument();
  });

  it("renders the remaining delivery badge states for accepted, delayed, failed, sending, and pending recipients", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData: {
              events: [
                {
                  id: 99,
                  restaurant_name: "Badge House",
                  restaurant_address: "5 Main St",
                  event_date: "2026-07-01",
                  event_time: "18:00",
                  status: "upcoming",
                  displayStatus: "upcoming",
                  created_at: "2026-03-01",
                },
              ],
              topRestaurant: null,
              topDate: null,
              smsMembers: [],
              eventMembersById: {
                99: [
                  {
                    id: 1,
                    name: "Accepted Member",
                    email: "accepted@example.com",
                    rsvp_status: null,
                    admin_override: 0,
                    hasAcceptedCalendarDelivery: true,
                    hasDeliveredCalendarDelivery: false,
                    lastCalendarDeliveryStatus: "provider_accepted",
                    lastCalendarDeliveryType: "invite",
                  },
                  {
                    id: 2,
                    name: "Delayed Member",
                    email: "delayed@example.com",
                    rsvp_status: null,
                    admin_override: 0,
                    hasAcceptedCalendarDelivery: false,
                    hasDeliveredCalendarDelivery: false,
                    lastCalendarDeliveryStatus: "delivery_delayed",
                    lastCalendarDeliveryType: "update",
                  },
                  {
                    id: 3,
                    name: "Failed Member",
                    email: "failed@example.com",
                    rsvp_status: null,
                    admin_override: 0,
                    hasAcceptedCalendarDelivery: false,
                    hasDeliveredCalendarDelivery: false,
                    lastCalendarDeliveryStatus: "complained",
                    lastCalendarDeliveryType: "update",
                  },
                  {
                    id: 4,
                    name: "Sending Member",
                    email: "sending@example.com",
                    rsvp_status: null,
                    admin_override: 0,
                    hasAcceptedCalendarDelivery: false,
                    hasDeliveredCalendarDelivery: false,
                    lastCalendarDeliveryStatus: "sending",
                    lastCalendarDeliveryType: "invite",
                  },
                  {
                    id: 5,
                    name: "Pending Member",
                    email: "pending@example.com",
                    rsvp_status: null,
                    admin_override: 0,
                    hasAcceptedCalendarDelivery: false,
                    hasDeliveredCalendarDelivery: false,
                    lastCalendarDeliveryStatus: "pending",
                    lastCalendarDeliveryType: "invite",
                  },
                ],
              },
            },
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Delayed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Sending")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Latest calendar email: invite / provider_accepted")).toBeInTheDocument();
    expect(screen.getByText("Latest calendar email: update / delivery_delayed")).toBeInTheDocument();
  });

  it("prefills the create form from vote leaders, resets it on cancel, and stops deletes when confirmation is declined", () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);

    render(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData: {
              events: [
                {
                  id: 42,
                  restaurant_name: "Prime Steakhouse",
                  restaurant_address: "123 Main St",
                  event_date: "2026-05-20",
                  event_time: "18:00",
                  status: "upcoming",
                  displayStatus: "upcoming",
                  created_at: "2026-03-01",
                },
              ],
              topRestaurant: {
                id: 5,
                name: "Prime Steakhouse",
                address: "123 Main St",
                vote_count: 4,
              },
              topDate: {
                id: 8,
                suggested_date: "2026-05-20",
                vote_count: 5,
              },
              smsMembers: [],
              eventMembersById: { 42: [] },
            },
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Prefill from Vote Leaders" }));

    expect(screen.getByRole("heading", { name: "Create New Event" })).toBeInTheDocument();
    expect((document.querySelector('input[name="restaurant_name"]') as HTMLInputElement).value).toBe(
      "Prime Steakhouse"
    );
    expect((screen.getByLabelText("Event Date *") as HTMLInputElement).value).toBe("2026-05-20");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Create New Event" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\+ Create Event/i }));
    expect((document.querySelector('input[name="restaurant_name"]') as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Event Date *") as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to delete the event "Prime Steakhouse" on formatted:2026-05-20? This action cannot be undone.'
    );
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("updates controlled create/edit fields and closes those forms after successful submissions", () => {
    const loaderData = {
      events: [
        {
          id: 42,
          restaurant_name: "Prime Steakhouse",
          restaurant_address: "123 Main St",
          event_date: "2026-05-20",
          event_time: "18:00",
          status: "upcoming",
          displayStatus: "upcoming",
          created_at: "2026-03-01",
        },
      ],
      topRestaurant: null,
      topDate: null,
      smsMembers: [],
      eventMembersById: { 42: [] },
    } as unknown as Route.ComponentProps["loaderData"];

    const { rerender } = render(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData,
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ Create Event/i }));
    fireEvent.change(screen.getByLabelText("Restaurant *"), {
      target: { value: "New Grill" },
    });
    fireEvent.change(screen.getByLabelText("Event Date *"), {
      target: { value: "2026-06-15" },
    });
    fireEvent.change(screen.getByLabelText("Event Time"), {
      target: { value: "19:15" },
    });

    expect((screen.getByLabelText("Restaurant *") as HTMLInputElement).value).toBe("New Grill");
    expect((screen.getByLabelText("Restaurant *") as HTMLInputElement).value).toBe("New Grill");

    navigationState = {
      state: "submitting",
      formData: (() => {
        const formData = new FormData();
        formData.set("_action", "create");
        return formData;
      })(),
    };
    rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData,
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    navigationState = { state: "idle", formData: null };
    rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData,
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole("heading", { name: "Create New Event" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editRestaurantInput = screen.getByLabelText("Restaurant *") as HTMLInputElement;
    const editAddressInput = screen.getByLabelText("Address") as HTMLInputElement;
    const editDateInput = document.querySelector('input[name="event_date"]') as HTMLInputElement;
    const editTimeInput = document.querySelector('input[name="event_time"]') as HTMLInputElement;
    const cancelledCheckbox = screen.getByRole("checkbox", { name: "Mark as cancelled" });

    fireEvent.change(editRestaurantInput, { target: { value: "Updated Grill" } });
    fireEvent.change(editAddressInput, { target: { value: "700 Oak Ave" } });
    fireEvent.change(editDateInput, { target: { value: "2026-06-30" } });
    fireEvent.change(editTimeInput, { target: { value: "20:00" } });
    fireEvent.click(cancelledCheckbox);

    expect(editRestaurantInput.value).toBe("Updated Grill");
    expect(editAddressInput.value).toBe("700 Oak Ave");
    expect(editDateInput.value).toBe("2026-06-30");
    expect(editTimeInput.value).toBe("20:00");
    expect(cancelledCheckbox).toBeChecked();

    navigationState = {
      state: "submitting",
      formData: (() => {
        const formData = new FormData();
        formData.set("_action", "update");
        return formData;
      })(),
    };
    rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData,
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    navigationState = { state: "idle", formData: null };
    rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/events"]}>
        <AdminEventsPage
          {...(({
            loaderData,
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
  });

  it("updates an event and schedules calendar updates for active members", async () => {
    const db = createMockDb();
    const queue = { sendBatch: vi.fn().mockResolvedValue(undefined) };

    const response = await action({
      request: createRequest({
        _action: "update",
        id: "42",
        restaurant_name: "Updated Grill",
        restaurant_address: "500 Market St",
        event_date: "2026-06-15",
        event_time: "",
        status: "cancelled",
        send_updates: "true",
      }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            EMAIL_DELIVERY_QUEUE: queue,
          },
          ctx: {},
        },
      } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/events");
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE events"),
        bindArgs: ["Updated Grill", "500 Market St", "2026-06-15", "18:00", "cancelled", 5, 42],
      })
    );
    expect(queue.sendBatch).toHaveBeenCalledWith([
      { body: { deliveryId: 21 } },
      { body: { deliveryId: 22 } },
    ]);
  });

  it("deletes an event after scheduling cancellation notices", async () => {
    const db = createMockDb();
    const queue = { sendBatch: vi.fn().mockResolvedValue(undefined) };

    const response = await action({
      request: createRequest({
        _action: "delete",
        id: "42",
      }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            EMAIL_DELIVERY_QUEUE: queue,
          },
        },
      } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect(queue.sendBatch).toHaveBeenCalledWith([
      { body: { deliveryId: 21 } },
      { body: { deliveryId: 22 } },
    ]);
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: "DELETE FROM events WHERE id = ?",
        bindArgs: [42],
      })
    );
  });

  it("validates SMS reminder recipients and returns background success when waitUntil is available", async () => {
    const db = createMockDb();
    const waitUntil = vi.fn();

    const invalidScope = await action({
      request: createRequest({
        _action: "send_sms_reminder",
        event_id: "42",
        message_type: "default",
        recipient_scope: "everyone",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(invalidScope).toEqual({ error: "Invalid recipient selection" });

    const success = await action({
      request: createRequest({
        _action: "send_sms_reminder",
        event_id: "42",
        message_type: "custom",
        custom_message: "Bring your appetite",
        recipient_scope: "specific",
        recipient_user_id: "7",
      }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_ACCOUNT_SID: "sid",
          },
          ctx: { waitUntil },
        },
      } as never,
      params: {},
    } as never);

    expect(success).toEqual({ success: "SMS reminder sending in the background." });
    expect(sendAdhocSmsReminder).toHaveBeenCalledWith({
      db,
      env: expect.objectContaining({ DB: db, TWILIO_ACCOUNT_SID: "sid" }),
      event: expect.objectContaining({ id: 42, restaurant_name: "Prime Steakhouse" }),
      customMessage: "Bring your appetite",
      recipientScope: "specific",
      recipientUserId: 7,
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("surfaces SMS reminder failures in the synchronous path", async () => {
    const db = createMockDb();
    vi.mocked(sendAdhocSmsReminder).mockResolvedValueOnce({
      sent: 1,
      errors: ["Twilio outage"],
    });

    const result = await action({
      request: createRequest({
        _action: "send_sms_reminder",
        event_id: "42",
        message_type: "default",
        recipient_scope: "all",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Some SMS messages failed: Twilio outage" });
  });
});
