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
  userRsvp?: Record<string, unknown> | null;
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
  userRsvp = null,
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

      if (normalizedSql === "SELECT status FROM rsvps WHERE event_id = ? AND user_id = ?") {
        return userRsvp;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async () => {
      if (normalizedSql === "SELECT * FROM site_content ORDER BY id ASC") {
        return { results: content };
      }

      if (normalizedSql === "SELECT * FROM events WHERE status != ? ORDER BY event_date ASC") {
        return { results: events };
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

  it("returns dashboard data without active poll or next event", async () => {
    const db = createMockDb({
      content: [{ id: 1, key: "description", title: "About", content: "Club details" }],
      memberCount: 12,
      activePoll: null,
      events: [{ id: 1, restaurant_name: "Past Grill", event_date: "2026-03-01", event_time: "18:00", status: "upcoming" }],
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
        nextEvent: null,
        userRsvp: null,
        content: [{ id: 1, key: "description", title: "About", content: "Club details" }],
        restaurants: [],
      })
    );
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

  it("returns active poll leaders, the next event, and the user's RSVP", async () => {
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
        { id: 5, restaurant_name: "Future Steakhouse", event_date: "2026-05-10", event_time: "19:00", status: "upcoming" },
        { id: 6, restaurant_name: "Past Grill", event_date: "2026-03-01", event_time: "18:00", status: "upcoming" },
      ],
      userRsvp: { status: "maybe" },
    });

    const result = await loader({
      request: new Request("http://localhost/dashboard"),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "America/New_York" } } } as never,
      params: {},
    } as never);

    expect(result).toEqual(
      expect.objectContaining({
        isAdmin: true,
        activePoll: { id: 8, title: "May Poll", created_at: "2026-04-01" },
        topRestaurants: [{ name: "Prime Steakhouse", vote_count: 3 }],
        nextEvent: { id: 5, restaurant_name: "Future Steakhouse", event_date: "2026-05-10", event_time: "19:00", status: "upcoming" },
        userRsvp: { status: "maybe" },
      })
    );
  });
});
