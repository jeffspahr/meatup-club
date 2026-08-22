import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "./dashboard._index";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

const user = {
  id: 7,
  email: "member@example.com",
  name: "Member Person",
  status: "active",
  is_admin: 0,
};

function createDb({ activePoll = null }: { activePoll?: { id: number; title: string } | null } = {}) {
  const prepare = vi.fn((sql: string) => {
    const execute = async (method: "all" | "first") => {
      if (sql.includes("FROM site_content")) {
        return { results: [{ id: 1, key: "welcome", title: "Welcome", content: "Hello" }] };
      }
      if (sql.includes("COUNT(*) as count FROM users")) {
        return { count: 12 };
      }
      if (sql.includes("FROM polls WHERE status")) {
        return activePoll;
      }
      if (sql.includes("MAX(vote_count)") && sql.includes("FROM restaurants")) {
        return { max_votes: 2 };
      }
      if (sql.includes("SELECT r.name, COUNT(rv.id)")) {
        return { results: [{ name: "Prime", vote_count: 2 }] };
      }
      if (sql.includes("FROM restaurant_votes rv") && sql.includes("WHERE rv.poll_id")) {
        return { name: "Prime" };
      }
      if (sql.includes("MAX(vote_count)") && sql.includes("FROM date_suggestions")) {
        return { max_votes: 3 };
      }
      if (sql.includes("SELECT ds.suggested_date, COUNT(dv.id)")) {
        return { results: [{ suggested_date: "2099-04-20", vote_count: 3 }] };
      }
      if (sql.includes("COUNT(*) as count") && sql.includes("FROM date_votes")) {
        return { count: 2 };
      }
      if (sql.includes("SELECT * FROM events")) {
        return {
          results: [
            {
              id: 1,
              restaurant_name: "Old Place",
              event_date: "2020-01-01",
              event_time: "18:00",
              status: "completed",
            },
            {
              id: 2,
              restaurant_name: "Future Prime",
              event_date: "2099-04-20",
              event_time: "18:30",
              status: "upcoming",
            },
          ],
        };
      }
      if (sql.includes("SELECT status FROM rsvps")) {
        return { status: "yes" };
      }
      throw new Error(`Unexpected ${method} query: ${sql}`);
    };

    return {
      all: () => execute("all"),
      first: () => execute("first"),
      bind: (..._args: unknown[]) => ({
        all: () => execute("all"),
        first: () => execute("first"),
      }),
    };
  });

  return { prepare };
}

describe("dashboard home loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue(user as any);
  });

  it("returns member summary content and the next non-past event", async () => {
    const db = createDb();

    const result = await loader({
      request: new Request("http://localhost/dashboard"),
      context: {
        cloudflare: { env: { DB: db, APP_TIMEZONE: "America/New_York" } },
      } as any,
    } as any);

    expect(result).toMatchObject({
      user,
      memberCount: 12,
      isAdmin: false,
      activePoll: null,
      topRestaurants: [],
      topDates: [],
      nextEvent: { id: 2, restaurant_name: "Future Prime" },
      userRsvp: { status: "yes" },
      content: [{ key: "welcome" }],
      userRestaurantVote: null,
      userDateVoteCount: 0,
    });
  });

  it("loads poll leaders and the member's current votes", async () => {
    const db = createDb({ activePoll: { id: 42, title: "Quarterly poll" } });

    const result = await loader({
      request: new Request("http://localhost/dashboard"),
      context: {
        cloudflare: { env: { DB: db, APP_TIMEZONE: "America/New_York" } },
      } as any,
    } as any);

    expect(result).toMatchObject({
      activePoll: { id: 42, title: "Quarterly poll" },
      topRestaurants: [{ name: "Prime", vote_count: 2 }],
      topDates: [{ suggested_date: "2099-04-20", vote_count: 3 }],
      userRestaurantVote: { name: "Prime" },
      userDateVoteCount: 2,
    });
  });
});
