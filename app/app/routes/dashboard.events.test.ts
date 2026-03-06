import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "./dashboard.events";
import { requireActiveUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import { upsertRsvp } from "../lib/rsvps.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../lib/rsvps.server", () => ({
  upsertRsvp: vi.fn(),
}));

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    getAppTimeZone: vi.fn(() => "America/New_York"),
    isEventInPastInTimeZone: vi.fn((eventDate: string) => eventDate < "2026-04-15"),
  };
});

type MockDbOptions = {
  events?: Array<Record<string, unknown>>;
  members?: Array<Record<string, unknown>>;
  userRsvpsByEvent?: Record<number, Record<string, unknown> | null>;
  allRsvpsByEvent?: Record<number, Array<Record<string, unknown>>>;
};

function createMockDb({
  events = [],
  members = [],
  userRsvpsByEvent = {},
  allRsvpsByEvent = {},
}: MockDbOptions = {}) {
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (bindArgs: unknown[]) => {
      if (normalizedSql === "SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?") {
        return userRsvpsByEvent[Number(bindArgs[0])] ?? null;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async (bindArgs: unknown[]) => {
      if (normalizedSql === "SELECT * FROM events ORDER BY event_date DESC") {
        return { results: events };
      }

      if (normalizedSql === "SELECT id, name, email, picture FROM users WHERE status = ? ORDER BY name ASC") {
        return { results: members };
      }

      if (normalizedSql.includes("SELECT r.*, u.name, u.email, u.picture FROM rsvps r JOIN users u ON r.user_id = u.id WHERE r.event_id = ?")) {
        return { results: allRsvpsByEvent[Number(bindArgs[0])] ?? [] };
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

function createRequest(formEntries?: Record<string, string>) {
  if (!formEntries) {
    return new Request("http://localhost/dashboard/events");
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/dashboard/events", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "user@example.com",
      name: "User",
    } as never);
    vi.mocked(logActivity).mockResolvedValue(undefined);
    vi.mocked(upsertRsvp).mockResolvedValue("created");
  });

  it("splits upcoming and past events and enriches upcoming events with RSVP data", async () => {
    const db = createMockDb({
      events: [
        { id: 1, restaurant_name: "Future Steakhouse", event_date: "2026-05-01", event_time: "19:00", status: "upcoming" },
        { id: 2, restaurant_name: "Past Grill", event_date: "2026-04-01", event_time: "18:00", status: "upcoming" },
        { id: 3, restaurant_name: "Cancelled Bistro", event_date: "2026-06-01", event_time: "20:00", status: "cancelled" },
      ],
      members: [
        { id: 123, name: "User", email: "user@example.com", picture: null },
        { id: 456, name: "Alice", email: "alice@example.com", picture: null },
        { id: 789, name: "Bob", email: "bob@example.com", picture: null },
      ],
      userRsvpsByEvent: {
        1: { id: 90, status: "yes", comments: "See you there" },
      },
      allRsvpsByEvent: {
        1: [
          { id: 90, user_id: 123, status: "yes", comments: "See you there", name: "User", email: "user@example.com", picture: null },
          { id: 91, user_id: 456, status: "maybe", comments: null, name: "Alice", email: "alice@example.com", picture: null },
        ],
      },
    });

    const result = await loader({
      request: createRequest(),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "America/New_York" } } } as never,
      params: {},
    } as never);

    expect(result.upcomingEvents).toHaveLength(1);
    expect(result.upcomingEvents[0]).toEqual(
      expect.objectContaining({
        id: 1,
        userRsvp: { id: 90, status: "yes", comments: "See you there" },
        allRsvps: [
          expect.objectContaining({ user_id: 123, status: "yes" }),
          expect.objectContaining({ user_id: 456, status: "maybe" }),
        ],
        notResponded: [{ id: 789, name: "Bob", email: "bob@example.com", picture: null }],
      })
    );
    expect(result.pastEvents).toEqual([
      expect.objectContaining({ id: 2, displayStatus: "completed" }),
      expect.objectContaining({ id: 3, displayStatus: "cancelled" }),
    ]);
  });

  it("returns an error when event_id or status is missing", async () => {
    const db = createMockDb();

    const result = await action({
      request: createRequest({ event_id: "1" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Missing required fields" });
    expect(upsertRsvp).not.toHaveBeenCalled();
  });

  it("creates a new RSVP and logs the create activity", async () => {
    const db = createMockDb();

    const response = await action({
      request: createRequest({
        event_id: "1",
        status: "yes",
        comments: "Count me in",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/events");
    expect(upsertRsvp).toHaveBeenCalledWith({
      db,
      eventId: 1,
      userId: 123,
      status: "yes",
      comments: "Count me in",
    });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "rsvp",
      })
    );
  });

  it("logs an update activity when an existing RSVP is changed", async () => {
    vi.mocked(upsertRsvp).mockResolvedValue("updated");
    const db = createMockDb();

    const response = await action({
      request: createRequest({
        event_id: "1",
        status: "maybe",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "update_rsvp",
        actionDetails: expect.objectContaining({ status: "maybe" }),
      })
    );
  });
});
