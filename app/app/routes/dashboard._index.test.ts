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
  maxRestaurantVotes?: number | null;
  topRestaurants?: Array<Record<string, unknown>>;
  userRestaurantVote?: Record<string, unknown> | null;
  maxDateVotes?: number | null;
  topDates?: Array<Record<string, unknown>>;
  userDateVoteCount?: number;
  events?: Array<Record<string, unknown>>;
  userRsvp?: Record<string, unknown> | null;
};

function createMockDb({
  content = [],
  memberCount = 0,
  activePoll = null,
  maxRestaurantVotes = 0,
  topRestaurants = [],
  userRestaurantVote = null,
  maxDateVotes = 0,
  topDates = [],
  userDateVoteCount = 0,
  events = [],
  userRsvp = null,
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

      if (normalizedSql.includes("SELECT MAX(vote_count) as max_votes") && normalizedSql.includes("FROM restaurants r")) {
        return { max_votes: maxRestaurantVotes };
      }

      if (normalizedSql.includes("SELECT r.name FROM restaurant_votes rv")) {
        return userRestaurantVote;
      }

      if (normalizedSql.includes("SELECT MAX(vote_count) as max_votes") && normalizedSql.includes("FROM date_suggestions ds")) {
        return { max_votes: maxDateVotes };
      }

      if (normalizedSql.includes("SELECT COUNT(*) as count FROM date_votes")) {
        return { count: userDateVoteCount };
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

      if (normalizedSql.includes("SELECT r.name, COUNT(rv.id) as vote_count")) {
        return { results: topRestaurants };
      }

      if (normalizedSql.includes("SELECT ds.suggested_date, COUNT(dv.id) as vote_count")) {
        return { results: topDates };
      }

      if (normalizedSql === "SELECT * FROM events WHERE status != ? ORDER BY event_date ASC") {
        return { results: events };
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
        memberCount: 12,
        isAdmin: false,
        activePoll: null,
        topRestaurants: [],
        topDates: [],
        nextEvent: null,
        userRsvp: null,
        userRestaurantVote: null,
        userDateVoteCount: 0,
        content: [{ id: 1, key: "description", title: "About", content: "Club details" }],
      })
    );
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
      maxRestaurantVotes: 3,
      topRestaurants: [{ name: "Prime Steakhouse", vote_count: 3 }],
      userRestaurantVote: { name: "Prime Steakhouse" },
      maxDateVotes: 4,
      topDates: [{ suggested_date: "2026-05-01", vote_count: 4 }],
      userDateVoteCount: 2,
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
        memberCount: 15,
        isAdmin: true,
        activePoll: { id: 8, title: "May Poll", created_at: "2026-04-01" },
        topRestaurants: [{ name: "Prime Steakhouse", vote_count: 3 }],
        topDates: [{ suggested_date: "2026-05-01", vote_count: 4 }],
        nextEvent: { id: 5, restaurant_name: "Future Steakhouse", event_date: "2026-05-10", event_time: "19:00", status: "upcoming" },
        userRsvp: { status: "maybe" },
        userRestaurantVote: { name: "Prime Steakhouse" },
        userDateVoteCount: 2,
      })
    );
  });
});
