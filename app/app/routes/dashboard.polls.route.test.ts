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
import {
  createComment,
  deleteComment,
  getComments,
} from "../lib/comments.server";
import { sendCommentReplyEmail } from "../lib/email.server";

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

vi.mock("../lib/comments.server", () => ({
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  getComments: vi.fn(),
}));

vi.mock("../lib/email.server", () => ({
  sendCommentReplyEmail: vi.fn(),
}));

type MockDbOptions = {
  activePoll?: Record<string, unknown> | null;
  existingRestaurantVote?: { restaurant_id: number } | null;
  restaurantOwner?: { created_by: number } | null;
  parentComment?: Record<string, unknown> | null;
  dateSuggestions?: unknown[];
  previousPolls?: unknown[];
  dateVotes?: unknown[];
  creatorById?: Record<number, { name: string | null; email: string | null }>;
};

function createMockDb({
  activePoll = { id: 1, title: "Weekly Poll", description: "Pick a meetup", created_at: "2026-03-01" },
  existingRestaurantVote = null,
  restaurantOwner = { created_by: 123 },
  parentComment = null,
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

      if (normalizedSql.includes("SELECT c.*, u.email, u.name, u.notify_comment_replies")) {
        return parentComment;
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

      if (normalizedSql.includes("FROM polls p LEFT JOIN events e")) {
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
    vi.mocked(getComments).mockResolvedValue([]);
    vi.mocked(createComment).mockResolvedValue(undefined);
    vi.mocked(deleteComment).mockResolvedValue(true);
    vi.mocked(sendCommentReplyEmail).mockResolvedValue({ success: true });
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
        comments: [],
        currentUser: {
          id: 123,
          isAdmin: false,
        },
      });
      expect(getRestaurantsForPoll).not.toHaveBeenCalled();
      expect(getComments).not.toHaveBeenCalled();
    });

    it("enriches restaurants with creator details and loads comments for the active poll", async () => {
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
      vi.mocked(getComments).mockResolvedValue([
        {
          id: 5,
          content: 'Looks good',
          replies: [],
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
      expect(getComments).toHaveBeenCalledWith(db, "poll", 1);
      expect(result.restaurantSuggestions).toEqual([
        expect.objectContaining({
          id: 88,
          suggested_by_name: "Alice",
          suggested_by_email: "alice@example.com",
        }),
      ]);
      expect(result.comments).toEqual([
        {
          id: 5,
          content: "Looks good",
          replies: [],
        },
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

    it("removes the current user's restaurant vote when they click the same option again", async () => {
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

  describe("comment actions", () => {
    it("validates comment content before creating a comment", async () => {
      const db = createMockDb();

      const emptyResult = await action({
        request: createRequest({
          _action: "add_comment",
          content: "   ",
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      const longResult = await action({
        request: createRequest({
          _action: "add_comment",
          content: "x".repeat(1001),
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      expect(emptyResult).toEqual({ error: "Comment content is required" });
      expect(longResult).toEqual({ error: "Comment must be less than 1000 characters" });
      expect(createComment).not.toHaveBeenCalled();
    });

    it("creates a top-level comment and redirects", async () => {
      const db = createMockDb();

      const response = await action({
        request: createRequest({
          _action: "add_comment",
          content: "  Looking forward to this.  ",
        }),
        context: { cloudflare: { env: { DB: db, RESEND_API_KEY: "test-key" } } } as never,
      } as never);

      expect((response as Response).status).toBe(302);
      expect(createComment).toHaveBeenCalledWith(db, 123, "poll", 1, "Looking forward to this.", null);
      expect(sendCommentReplyEmail).not.toHaveBeenCalled();
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: "comment",
        })
      );
    });

    it("sends a reply notification with waitUntil when the parent author wants emails", async () => {
      const waitUntil = vi.fn();
      const db = createMockDb({
        parentComment: {
          id: 10,
          user_id: 999,
          email: "parent@example.com",
          name: "Parent",
          notify_comment_replies: 1,
          content: "Original comment",
        },
      });

      const response = await action({
        request: createRequest({
          _action: "add_comment",
          content: "Thanks for the context",
          parent_id: "10",
        }),
        context: {
          cloudflare: {
            env: { DB: db, RESEND_API_KEY: "reply-key" },
            ctx: { waitUntil },
          },
        } as never,
      } as never);

      expect((response as Response).status).toBe(302);
      expect(createComment).toHaveBeenCalledWith(db, 123, "poll", 1, "Thanks for the context", 10);
      expect(sendCommentReplyEmail).toHaveBeenCalledWith({
        to: "parent@example.com",
        recipientName: "Parent",
        replierName: "User",
        originalComment: "Original comment",
        replyContent: "Thanks for the context",
        pollUrl: "http://localhost/dashboard/polls",
        resendApiKey: "reply-key",
      });
      expect(waitUntil).toHaveBeenCalledTimes(1);
    });

    it("skips reply email delivery when the parent author is the same user", async () => {
      const db = createMockDb({
        parentComment: {
          id: 10,
          user_id: 123,
          email: "user@example.com",
          name: "User",
          notify_comment_replies: 1,
          content: "Original comment",
        },
      });

      const response = await action({
        request: createRequest({
          _action: "add_comment",
          content: "Self-reply",
          parent_id: "10",
        }),
        context: {
          cloudflare: {
            env: { DB: db, RESEND_API_KEY: "reply-key" },
          },
        } as never,
      } as never);

      expect((response as Response).status).toBe(302);
      expect(sendCommentReplyEmail).not.toHaveBeenCalled();
    });

    it("returns an error when comment deletion fails permission checks", async () => {
      vi.mocked(deleteComment).mockResolvedValue(false);
      const db = createMockDb();

      const result = await action({
        request: createRequest({
          _action: "delete_comment",
          comment_id: "55",
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      expect(result).toEqual({ error: "Permission denied or comment not found" });
      expect(logActivity).not.toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: "delete_comment",
        })
      );
    });

    it("deletes a comment and redirects when authorized", async () => {
      const db = createMockDb();

      const response = await action({
        request: createRequest({
          _action: "delete_comment",
          comment_id: "55",
        }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);

      expect((response as Response).status).toBe(302);
      expect(deleteComment).toHaveBeenCalledWith(db, 55, 123, false);
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: "delete_comment",
        })
      );
    });
  });
});
