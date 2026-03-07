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
import {
  sendEventCancellation,
  sendEventUpdate,
} from "../lib/email.server";
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

vi.mock("../lib/email.server", () => ({
  sendEventUpdate: vi.fn(),
  sendEventCancellation: vi.fn(),
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
  updateRecipients?: Array<Record<string, unknown>>;
  deleteRecipients?: Array<Record<string, unknown>>;
  eventForLookup?: Record<string, unknown> | null;
  eventForDelete?: Record<string, unknown> | null;
  eventMeta?: Record<string, unknown> | null;
  failingSqlIncludes?: string | null;
};

function createMockDb({
  events = [],
  smsMembers = [],
  rsvpRows = [],
  activeMembers = [],
  updateRecipients = [],
  deleteRecipients = [],
  eventForLookup = {
    id: 42,
    restaurant_name: "Prime Steakhouse",
    restaurant_address: "123 Main St",
    event_date: "2026-05-20",
    event_time: "18:00",
  },
  eventForDelete = {
    id: 42,
    restaurant_name: "Prime Steakhouse",
    restaurant_address: "123 Main St",
    event_date: "2026-05-20",
    event_time: "18:00",
    calendar_sequence: 4,
  },
  eventMeta = { calendar_sequence: 5 },
  failingSqlIncludes = null,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (_bindArgs: unknown[]) => {
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

      if (normalizedSql === "SELECT calendar_sequence FROM events WHERE id = ?") {
        return eventMeta;
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

      if (normalizedSql.includes("SELECT u.email, r.status as rsvp_status")) {
        return { results: updateRecipients };
      }

      if (normalizedSql === "SELECT u.email FROM users u WHERE u.status = 'active'") {
        return { results: deleteRecipients };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });

      if (failingSqlIncludes && normalizedSql.includes(failingSqlIncludes)) {
        throw new Error(`${failingSqlIncludes} failed`);
      }

      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstForArgs([]),
      all: () => allForArgs([]),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: () => allForArgs(bindArgs),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return { prepare, runCalls };
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
    vi.mocked(sendEventUpdate).mockResolvedValue({ success: true });
    vi.mocked(sendEventCancellation).mockResolvedValue({ success: true });
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
    expect(screen.getByLabelText("Restaurant Name *")).toHaveValue("");
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
                  },
                ],
              },
            },
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Create from Vote Winners" })).toBeInTheDocument();
    expect(screen.getAllByText("Prime Steakhouse")).toHaveLength(2);
    expect(screen.getAllByText("123 Main St")).toHaveLength(2);
    expect(screen.getByText("formatted:2026-05-20")).toBeInTheDocument();
    expect(formatTimeForDisplay).toHaveBeenCalledWith("18:00");
    expect(screen.getByText("Admin override")).toBeInTheDocument();
    expect(screen.getByText("Current RSVP: yes")).toBeInTheDocument();

    const recipientScope = document.querySelector('select[name="recipient_scope"]');
    expect(recipientScope).not.toBeNull();
    fireEvent.change(recipientScope as unknown as HTMLSelectElement, { target: { value: "specific" } });

    expect(screen.getByText("Specific Recipient")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pat Member" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create from Vote Winners" }));
    expect(screen.getByRole("heading", { name: "Create New Event" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByDisplayValue("Prime Steakhouse")).toBeInTheDocument();
    expect(screen.getByDisplayValue("123 Main St")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-05-20")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Prime Steakhouse"), {
      target: { value: "Updated Grill" },
    });
    fireEvent.change(screen.getByDisplayValue("123 Main St"), {
      target: { value: "500 Market St" },
    });
    fireEvent.change(screen.getByDisplayValue("2026-05-20"), {
      target: { value: "2026-06-15" },
    });
    fireEvent.change(screen.getAllByDisplayValue("18:00")[1]!, {
      target: { value: "19:45" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark as cancelled" }));

    expect(screen.getByDisplayValue("Updated Grill")).toBeInTheDocument();
    expect(screen.getByDisplayValue("500 Market St")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-06-15")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("19:45")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Mark as cancelled" })).toBeChecked();

    fireEvent.click(screen.getAllByRole("button", { name: /^Cancel$/i })[1]!);

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

  it("updates an event and schedules calendar updates for active members", async () => {
    const db = createMockDb({
      updateRecipients: [
        { email: "alice@example.com", rsvp_status: "yes" },
        { email: "bob@example.com", rsvp_status: null },
      ],
      eventMeta: { calendar_sequence: 6 },
    });
    const waitUntil = vi.fn();

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
            RESEND_API_KEY: "test-api-key",
          },
          ctx: { waitUntil },
        },
      } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/events");
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE events"),
        bindArgs: ["Updated Grill", "500 Market St", "2026-06-15", "18:00", "cancelled", 42],
      })
    );
    expect(sendEventUpdate).toHaveBeenCalledTimes(2);
    expect(sendEventUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventId: 42,
        restaurantName: "Updated Grill",
        eventDate: "2026-06-15",
        eventTime: "18:00",
        userEmail: "alice@example.com",
        rsvpStatus: "yes",
        sequence: 6,
        resendApiKey: "test-api-key",
      })
    );
    expect(sendEventUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userEmail: "bob@example.com",
        rsvpStatus: undefined,
      })
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
  });

  it("validates update input and surfaces update failures", async () => {
    const missingFieldsResult = await action({
      request: createRequest({
        _action: "update",
        id: "42",
        event_date: "2026-06-15",
      }),
      context: { cloudflare: { env: { DB: createMockDb() } } } as never,
      params: {},
    } as never);

    const failureResult = await action({
      request: createRequest({
        _action: "update",
        id: "42",
        restaurant_name: "Updated Grill",
        event_date: "2026-06-15",
      }),
      context: {
        cloudflare: {
          env: { DB: createMockDb({ failingSqlIncludes: "UPDATE events" }) },
        },
      } as never,
      params: {},
    } as never);

    expect(missingFieldsResult).toEqual({ error: "ID, restaurant name and date are required" });
    expect(failureResult).toEqual({ error: "Failed to update event" });
  });

  it("deletes an event after scheduling cancellation notices", async () => {
    const db = createMockDb({
      deleteRecipients: [{ email: "alice@example.com" }, { email: "bob@example.com" }],
      eventForDelete: {
        id: 42,
        restaurant_name: "Prime Steakhouse",
        restaurant_address: "123 Main St",
        event_date: "2026-05-20",
        event_time: "18:00",
        calendar_sequence: 4,
      },
    });

    const response = await action({
      request: createRequest({
        _action: "delete",
        id: "42",
      }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
        },
      } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect(sendEventCancellation).toHaveBeenCalledTimes(2);
    expect(sendEventCancellation).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 42,
        restaurantName: "Prime Steakhouse",
        userEmail: "alice@example.com",
        sequence: 5,
        resendApiKey: "test-api-key",
      })
    );
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: "DELETE FROM events WHERE id = ?",
        bindArgs: [42],
      })
    );
  });

  it("validates delete input, tolerates missing events, and returns delete failures", async () => {
    const missingIdResult = await action({
      request: createRequest({
        _action: "delete",
      }),
      context: { cloudflare: { env: { DB: createMockDb() } } } as never,
      params: {},
    } as never);

    const noEventResponse = await action({
      request: createRequest({
        _action: "delete",
        id: "42",
      }),
      context: {
        cloudflare: {
          env: { DB: createMockDb({ eventForDelete: null }) },
        },
      } as never,
      params: {},
    } as never);

    const failingDeleteResult = await action({
      request: createRequest({
        _action: "delete",
        id: "42",
      }),
      context: {
        cloudflare: {
          env: { DB: createMockDb({ failingSqlIncludes: "DELETE FROM events" }) },
        },
      } as never,
      params: {},
    } as never);

    expect(missingIdResult).toEqual({ error: "Event ID is required" });
    expect((noEventResponse as Response).status).toBe(302);
    expect(sendEventCancellation).not.toHaveBeenCalled();
    expect(failingDeleteResult).toEqual({ error: "Failed to delete event" });
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

  it("validates other SMS reminder guard rails and rejects invalid actions", async () => {
    const db = createMockDb();

    const missingIdResult = await action({
      request: createRequest({
        _action: "send_sms_reminder",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    const missingCustomMessageResult = await action({
      request: createRequest({
        _action: "send_sms_reminder",
        event_id: "42",
        message_type: "custom",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    const specificScopeResult = await action({
      request: createRequest({
        _action: "send_sms_reminder",
        event_id: "42",
        recipient_scope: "specific",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    const missingEventResult = await action({
      request: createRequest({
        _action: "send_sms_reminder",
        event_id: "42",
      }),
      context: {
        cloudflare: {
          env: { DB: createMockDb({ eventForLookup: null }) },
        },
      } as never,
      params: {},
    } as never);

    const successResult = await action({
      request: createRequest({
        _action: "send_sms_reminder",
        event_id: "42",
        recipient_scope: "pending",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    const invalidActionResult = await action({
      request: createRequest({
        _action: "archive",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(missingIdResult).toEqual({ error: "Event ID is required for SMS reminders" });
    expect(missingCustomMessageResult).toEqual({ error: "Custom SMS message cannot be empty" });
    expect(specificScopeResult).toEqual({ error: "Select a specific recipient" });
    expect(missingEventResult).toEqual({ error: "Event not found" });
    expect(successResult).toEqual({ success: "Sent 2 SMS reminders." });
    expect(invalidActionResult).toEqual({ error: "Invalid action" });
  });
});
