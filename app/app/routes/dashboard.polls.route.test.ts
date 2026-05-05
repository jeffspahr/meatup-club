import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "./dashboard.polls";
import { requireActiveUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import {
  createRestaurant,
  deleteRestaurant,
  findRestaurantByPlaceId,
  getRestaurantsForPoll,
  removeVote,
  voteForRestaurant,
} from "../lib/restaurants.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../lib/restaurants.server", () => ({
  createRestaurant: vi.fn(),
  deleteRestaurant: vi.fn(),
  findRestaurantByPlaceId: vi.fn(),
  getRestaurantsForPoll: vi.fn(),
  removeVote: vi.fn(),
  voteForRestaurant: vi.fn(),
}));

type MockDbOptions = {
  activePoll?: Record<string, unknown> | null;
  existingRestaurantVote?: { restaurant_id: number } | null;
  restaurantOwner?: { created_by: number } | null;
  dateSuggestions?: unknown[];
  previousPolls?: unknown[];
  dateVotes?: unknown[];
  creatorById?: Record<number, { name: string | null; email: string | null }>;
};

function createMockDb({
  activePoll = { id: 1, title: "Weekly Poll", description: "Pick a meetup", created_at: "2026-03-01" },
  existingRestaurantVote = null,
  restaurantOwner = { created_by: 123 },
  dateSuggestions = [],
  previousPolls = [],
  dateVotes = [],
  creatorById = {},
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (bindArgs: unknown[]) => {
      if (normalizedSql.includes("SELECT * FROM polls WHERE status = 'active'")) {
        return activePoll;
      }

      if (normalizedSql.includes("SELECT id FROM polls WHERE status = 'active'")) {
        return activePoll ? { id: activePoll.id } : null;
      }

      if (normalizedSql.includes("SELECT restaurant_id FROM restaurant_votes WHERE poll_id = ? AND user_id = ?")) {
        return existingRestaurantVote;
      }

      if (normalizedSql.includes("SELECT created_by FROM restaurants WHERE id = ?")) {
        return restaurantOwner;
      }

      if (normalizedSql.includes("SELECT name, email FROM users WHERE id = ?")) {
        return creatorById[Number(bindArgs[0])] ?? null;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async () => {
      if (normalizedSql.includes("FROM date_suggestions ds JOIN users u")) {
        return { results: dateSuggestions };
      }

      if (normalizedSql.includes("FROM polls p LEFT JOIN restaurants r")) {
        return { results: previousPolls };
      }

      if (normalizedSql.includes("FROM date_votes dv JOIN date_suggestions ds")) {
        return { results: dateVotes };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });
      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstForArgs([]),
      all: () => allForArgs(),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: () => allForArgs(),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return { prepare, runCalls };
}

function createRequest(formEntries?: Record<string, string>) {
  if (!formEntries) {
    return new Request("http://localhost/dashboard/polls");
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/dashboard/polls", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.polls route", () => {
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
    vi.mocked(getRestaurantsForPoll).mockResolvedValue([]);
    vi.mocked(createRestaurant).mockResolvedValue(10);
    vi.mocked(findRestaurantByPlaceId).mockResolvedValue(null);
    vi.mocked(removeVote).mockResolvedValue(undefined);
    vi.mocked(voteForRestaurant).mockResolvedValue(undefined);
    vi.mocked(deleteRestaurant).mockResolvedValue(undefined);
  });

  describe("loader", () => {
    it("returns empty poll data when no active poll exists", async () => {
      const db = createMockDb({ activePoll: null });

      const result = await loader({
        request: createRequest(),
        context: { cloudflare: { env: { DB: db } } } as never,
        params: {},
      } as never);

      expect(result).toEqual({
        dateSuggestions: [],
        restaurantSuggestions: [],
        activePoll: null,
        previousPolls: [],
        dateVotes: [],
        currentUser: {
          id: 123,
          isAdmin: false,
        },
      });
      expect(getRestaurantsForPoll).not.toHaveBeenCalled();
    });

    it("enriches restaurants with creator details for the active poll", async () => {
      vi.mocked(getRestaurantsForPoll).mockResolvedValue([
        {
          id: 88,
          name: 'Prime Steakhouse',
          address: '123 Main St',
          cuisine: 'Steakhouse',
          created_by: 777,
          vote_count: 4,
          user_has_voted: true,
        },
      ] as never);
      const db = createMockDb({
        dateSuggestions: [{ id: 1, suggested_date: "2026-05-01" }],
        dateVotes: [{ date_suggestion_id: 1, user_id: 123, suggested_date: "2026-05-01" }],
        previousPolls: [{ id: 9, title: "Older Poll" }],
        creatorById: {
          777: { name: "Alice", email: "alice@example.com" },
        },
      });

      const result = await loader({
        request: createRequest(),
        context: { cloudflare: { env: { DB: db } } } as never,
        params: {},
      } as never);

      expect(getRestaurantsForPoll).toHaveBeenCalledWith(db, 1, 123);
      expect(result.restaurantSuggestions).toEqual([
        expect.objectContaining({
          id: 88,
          suggested_by_name: "Alice",
          suggested_by_email: "alice@example.com",
        }),
      ]);
    });

    it("normalizes legacy restaurant photo URLs for poll cards", async () => {
      vi.mocked(getRestaurantsForPoll).mockResolvedValue([
        {
          id: 88,
          name: "Prime Steakhouse",
          address: "123 Main St",
          cuisine: "Steakhouse",
          created_by: 777,
          vote_count: 4,
          user_has_voted: true,
          photo_url:
            "https://places.googleapis.com/v1/places/abc123/photos/photo-1/media?maxHeightPx=320&maxWidthPx=640&key=test-key",
        },
        {
          id: 89,
          name: "Oak Steakhouse",
          address: "456 Elm St",
          cuisine: "Steakhouse",
          created_by: 777,
          vote_count: 2,
          user_has_voted: false,
          photo_url:
            "https://meatup.club/api/places/photo?name=places%2Fdef456%2Fphotos%2Fphoto-2&maxHeightPx=400&maxWidthPx=400",
        },
      ] as never);
      const db = createMockDb({
        previousPolls: [{ id: 9, title: "Older Poll" }],
        creatorById: {
          777: { name: "Alice", email: "alice@example.com" },
        },
      });

      const result = await loader({
        request: createRequest(),
        context: { cloudflare: { env: { DB: db } } } as never,
        params: {},
      } as never);

      expect(result.restaurantSuggestions).toEqual([
        expect.objectContaining({
          id: 88,
          photo_url:
            "/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=320&maxWidthPx=640",
        }),
        expect.objectContaining({
          id: 89,
          photo_url:
            "/api/places/photo?name=places%2Fdef456%2Fphotos%2Fphoto-2&maxHeightPx=400&maxWidthPx=400",
        }),
      ]);
      expect(result.previousPolls).toEqual([{ id: 9, title: "Older Poll" }]);
    });

    it("returns closed poll winners even when no event was created", async () => {
      const db = createMockDb({
        activePoll: null,
        previousPolls: [
          {
            id: 9,
            title: "Older Poll",
            winner_restaurant: "Prime Steakhouse",
            winner_date: "2026-05-01",
          },
        ],
      });

      const result = await loader({
        request: createRequest(),
        context: { cloudflare: { env: { DB: db } } } as never,
        params: {},
      } as never);

      expect(result.previousPolls).toEqual([
        expect.objectContaining({
          id: 9,
          winner_restaurant: "Prime Steakhouse",
          winner_date: "2026-05-01",
        }),
      ]);
    });
  });

  describe("restaurant actions", () => {
    it("rejects duplicate restaurant suggestions by place id", async () => {
      vi.mocked(findRestaurantByPlaceId).mockResolvedValue({ id: 99 } as never);
      const db = createMockDb();

      const result = await action({
        request: createRequest({
          _action: "suggest_restaurant",
          place_id: "place-123",
          name: "Prime Steakhouse",
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      expect(result).toEqual({ error: "This restaurant has already been added" });
      expect(createRestaurant).not.toHaveBeenCalled();
    });

    it("creates a new restaurant suggestion and redirects", async () => {
      const db = createMockDb();

      const response = await action({
        request: createRequest({
          _action: "suggest_restaurant",
          place_id: "place-123",
          name: "Prime Steakhouse",
          address: "123 Main St",
          cuisine: "Steakhouse",
          photo_url: "https://example.com/prime.jpg",
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get("Location")).toBe("/dashboard/polls");
      expect(createRestaurant).toHaveBeenCalledWith(db, {
        name: "Prime Steakhouse",
        address: "123 Main St",
        google_place_id: "place-123",
        cuisine: "Steakhouse",
        photo_url: "https://example.com/prime.jpg",
        created_by: 123,
      });
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 123,
          actionType: "suggest_restaurant",
        })
      );
    });

    it("removes the current user's restaurant vote via unvote_restaurant", async () => {
      const db = createMockDb({
        existingRestaurantVote: { restaurant_id: 5 },
      });

      const response = await action({
        request: createRequest({
          _action: "unvote_restaurant",
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      expect((response as Response).status).toBe(302);
      expect(removeVote).toHaveBeenCalledWith(db, 1, 123);
      expect(voteForRestaurant).not.toHaveBeenCalled();
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: "unvote_restaurant",
        })
      );
    });

    it("changes the current user's restaurant vote when they pick a different option", async () => {
      const db = createMockDb({
        existingRestaurantVote: { restaurant_id: 2 },
      });

      const response = await action({
        request: createRequest({
          _action: "vote_restaurant",
          suggestion_id: "5",
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      expect((response as Response).status).toBe(302);
      expect(voteForRestaurant).toHaveBeenCalledWith(db, 1, 5, 123);
      expect(removeVote).not.toHaveBeenCalled();
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: "vote_restaurant",
          actionDetails: expect.objectContaining({ changed: true }),
        })
      );
    });

    it("re-submitting the same vote keeps it in place (no toggle)", async () => {
      const db = createMockDb({
        existingRestaurantVote: { restaurant_id: 5 },
      });

      const response = await action({
        request: createRequest({
          _action: "vote_restaurant",
          suggestion_id: "5",
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      expect((response as Response).status).toBe(302);
      expect(voteForRestaurant).toHaveBeenCalledWith(db, 1, 5, 123);
      expect(removeVote).not.toHaveBeenCalled();
    });

    it("rejects deleting a restaurant the user does not own", async () => {
      const db = createMockDb({
        restaurantOwner: { created_by: 999 },
      });

      const result = await action({
        request: createRequest({
          _action: "delete_restaurant",
          suggestion_id: "5",
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      expect(result).toEqual({ error: "Permission denied" });
      expect(deleteRestaurant).not.toHaveBeenCalled();
    });
  });

});
