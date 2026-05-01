import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "./dashboard._index";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
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
  content?: Array<Record<string, unknown>>;
  memberCount?: number;
  activePoll?: Record<string, unknown> | null;
  events?: Array<Record<string, unknown>>;
  members?: Array<Record<string, unknown>>;
  userRsvp?: Record<string, unknown> | null;
  allRsvpsForEvent?: Array<Record<string, unknown>>;
  restaurants?: Array<Record<string, unknown>>;
  dateSuggestions?: Array<Record<string, unknown>>;
  dateVotes?: Array<Record<string, unknown>>;
  pollRestaurants?: Array<Record<string, unknown>>;
  previousPolls?: Array<Record<string, unknown>>;
};

function createMockDb({
  content = [],
  memberCount = 0,
  activePoll = null,
  events = [],
  members = [],
  userRsvp = null,
  allRsvpsForEvent = [],
  restaurants = [],
  dateSuggestions = [],
  dateVotes = [],
  pollRestaurants = [],
  previousPolls = [],
}: MockDbOptions = {}) {
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async () => {
      if (normalizedSql === "SELECT COUNT(*) as count FROM users WHERE status = ?") {
        return { count: memberCount };
      }

      if (normalizedSql === "SELECT * FROM polls WHERE status = ? ORDER BY created_at DESC LIMIT 1") {
        return activePoll;
      }

      if (normalizedSql === "SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?") {
        return userRsvp;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async () => {
      if (normalizedSql === "SELECT * FROM site_content ORDER BY id ASC") {
        return { results: content };
      }

      if (normalizedSql.includes("FROM events e LEFT JOIN users u ON e.created_by = u.id")) {
        return { results: events };
      }

      if (normalizedSql === "SELECT id, name, email, picture FROM users WHERE status = ? ORDER BY name ASC") {
        return { results: members };
      }

      if (normalizedSql.includes("FROM rsvps r JOIN users u ON r.user_id = u.id")) {
        return { results: allRsvpsForEvent };
      }

      if (normalizedSql.includes("FROM restaurants r LEFT JOIN users u ON r.created_by = u.id ORDER BY r.name ASC")) {
        return { results: restaurants };
      }

      if (normalizedSql.includes("FROM date_suggestions ds JOIN users u ON ds.user_id = u.id")) {
        return { results: dateSuggestions };
      }

      if (normalizedSql.includes("FROM date_votes dv JOIN date_suggestions ds")) {
        return { results: dateVotes };
      }

      if (normalizedSql.includes("FROM restaurants r LEFT JOIN poll_excluded_restaurants per")) {
        return { results: pollRestaurants };
      }

      if (
        normalizedSql.includes("FROM polls p LEFT JOIN restaurants r ON p.winning_restaurant_id = r.id")
      ) {
        return { results: previousPolls };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    return {
      first: () => firstForArgs(),
      all: () => allForArgs(),
      bind: (..._bindArgs: unknown[]) => ({
        first: () => firstForArgs(),
        all: () => allForArgs(),
      }),
    };
  });

  return { prepare };
}

describe("dashboard._index loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "user@example.com",
      name: "User Test",
      phone_number: null,
    } as never);
  });

  it("returns dashboard data with no upcoming events when all events are in the past", async () => {
    const db = createMockDb({
      content: [{ id: 1, key: "description", title: "About", content: "Club details" }],
      memberCount: 12,
      activePoll: null,
      events: [
        {
          id: 1,
          restaurant_name: "Past Grill",
          restaurant_address: null,
          event_date: "2026-03-01",
          event_time: "18:00",
          status: "upcoming",
          calendar_sequence: 0,
          created_by: null,
          creator_name: null,
          creator_email: null,
        },
      ],
    });

    const result = await loader({
      request: new Request("http://localhost/dashboard"),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "America/New_York" } } } as never,
      params: {},
    } as never);

    expect(result).toEqual(
      expect.objectContaining({
        isAdmin: false,
        activePoll: null,
        topRestaurants: [],
        dateSuggestions: [],
        dateVotes: [],
        restaurantSuggestions: [],
        previousPolls: [],
        upcomingEvents: [],
        restaurants: [],
      })
    );
    expect((result as { pastEvents: unknown[] }).pastEvents).toHaveLength(1);
  });

  it("returns the restaurant collection sorted by name", async () => {
    const db = createMockDb({
      restaurants: [
        {
          id: 10,
          created_by: 5,
          name: "Alpha Steakhouse",
          address: "1 Main St, Brooklyn, NY 11201, USA",
          google_rating: 4.5,
          price_level: 3,
          photo_url: null,
          google_maps_url: "https://maps.google.com/?q=alpha",
          opening_hours: null,
          suggested_by_name: "Alice",
        },
        {
          id: 11,
          created_by: 6,
          name: "Beta Grill",
          address: "2 Oak Ave, Newark, NJ 07102, USA",
          google_rating: 4.1,
          price_level: 2,
          photo_url: null,
          google_maps_url: null,
          opening_hours: null,
          suggested_by_name: "Bob",
        },
      ],
    });

    const result = await loader({
      request: new Request("http://localhost/dashboard"),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "America/New_York" } } } as never,
      params: {},
    } as never);

    expect((result as { restaurants: Array<{ id: number; name: string }> }).restaurants).toEqual([
      expect.objectContaining({ id: 10, name: "Alpha Steakhouse" }),
      expect.objectContaining({ id: 11, name: "Beta Grill" }),
    ]);
  });

  it("returns active poll leaders, upcoming events with RSVP detail, and past events", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 1,
      status: "active",
      email: "user@example.com",
      name: "User Test",
      phone_number: "+15551234567",
    } as never);
    const db = createMockDb({
      memberCount: 15,
      activePoll: { id: 8, title: "May Poll", created_at: "2026-04-01" },
      pollRestaurants: [
        { id: 1, name: "Prime Steakhouse", vote_count: 3, user_has_voted: 0 },
        { id: 2, name: "Beta Grill", vote_count: 1, user_has_voted: 0 },
      ],
      events: [
        {
          id: 5,
          restaurant_name: "Future Steakhouse",
          restaurant_address: "1 Main St",
          event_date: "2026-05-10",
          event_time: "19:00",
          status: "upcoming",
          calendar_sequence: 0,
          created_by: 123,
          creator_name: "User Test",
          creator_email: "user@example.com",
        },
        {
          id: 6,
          restaurant_name: "Past Grill",
          restaurant_address: null,
          event_date: "2026-03-01",
          event_time: "18:00",
          status: "upcoming",
          calendar_sequence: 0,
          created_by: 999,
          creator_name: "Other",
          creator_email: "other@example.com",
        },
      ],
      members: [{ id: 123, name: "User Test", email: "user@example.com", picture: null }],
      userRsvp: { status: "maybe", comments: null },
      allRsvpsForEvent: [],
    });

    const result = await loader({
      request: new Request("http://localhost/dashboard"),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "America/New_York" } } } as never,
      params: {},
    } as never);

    const typed = result as {
      isAdmin: boolean;
      activePoll: unknown;
      topRestaurants: unknown;
      upcomingEvents: Array<{ id: number; userRsvp: { status: string } | null }>;
      pastEvents: Array<{ id: number; restaurant_name: string }>;
    };

    expect(typed.isAdmin).toBe(true);
    expect(typed.activePoll).toEqual({ id: 8, title: "May Poll", created_at: "2026-04-01" });
    expect(typed.topRestaurants).toEqual([{ name: "Prime Steakhouse", vote_count: 3 }]);

    expect(typed.upcomingEvents).toHaveLength(1);
    expect(typed.upcomingEvents[0]).toEqual(
      expect.objectContaining({
        id: 5,
        restaurant_name: "Future Steakhouse",
        userRsvp: { status: "maybe", comments: null },
      })
    );

    expect(typed.pastEvents).toHaveLength(1);
    expect(typed.pastEvents[0]).toEqual(
      expect.objectContaining({ id: 6, restaurant_name: "Past Grill" })
    );
  });
});
