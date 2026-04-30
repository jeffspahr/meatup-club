import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard._index";
import { requireActiveUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import { removeVote, voteForRestaurant } from "../lib/restaurants.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../lib/restaurants.server", async () => {
  const actual = await vi.importActual<typeof import("../lib/restaurants.server")>(
    "../lib/restaurants.server",
  );
  return {
    ...actual,
    voteForRestaurant: vi.fn(),
    removeVote: vi.fn(),
  };
});

type MockDbOptions = {
  activePoll?: { id: number } | null;
  existingDate?: { id: number } | null;
  suggestion?: { id: number; poll_id: number; suggested_date: string } | null;
  existingVote?: { id: number } | null;
  dateOwner?: { user_id: number; poll_id: number } | null;
  insertSuggestionId?: number | null;
  existingRestaurantVote?: { restaurant_id: number } | null;
};

function createMockDb({
  activePoll = { id: 1 },
  existingDate = null,
  suggestion = { id: 10, poll_id: 1, suggested_date: "2099-01-01" },
  existingVote = null,
  dateOwner = { user_id: 123, poll_id: 1 },
  insertSuggestionId = 555,
  existingRestaurantVote = null,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql.includes("SELECT id FROM polls WHERE status = 'active'")) {
        return activePoll;
      }
      if (normalizedSql.includes("SELECT id FROM date_suggestions WHERE suggested_date = ? AND poll_id = ?")) {
        return existingDate;
      }
      if (normalizedSql.includes("SELECT id, poll_id, suggested_date FROM date_suggestions WHERE id = ?")) {
        return suggestion;
      }
      if (normalizedSql.includes("SELECT id FROM date_votes WHERE poll_id = ? AND date_suggestion_id = ? AND user_id = ?")) {
        return existingVote;
      }
      if (normalizedSql.includes("SELECT user_id, poll_id FROM date_suggestions WHERE id = ?")) {
        return dateOwner;
      }
      if (normalizedSql.includes("SELECT restaurant_id FROM restaurant_votes WHERE poll_id = ? AND user_id = ?")) {
        return existingRestaurantVote;
      }
      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });
      if (normalizedSql.includes("INSERT INTO date_suggestions")) {
        return { meta: { last_row_id: insertSuggestionId } };
      }
      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstForArgs([]),
      all: async () => ({ results: [] }),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: async () => ({ results: [] }),
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
  return new Request("http://localhost/dashboard", {
    method: "POST",
    body: formData,
  });
}

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
  vi.mocked(voteForRestaurant).mockResolvedValue(undefined);
  vi.mocked(removeVote).mockResolvedValue(undefined);
});

describe("dashboard._index poll actions — gating", () => {
  it("rejects every poll intent when no poll is active", async () => {
    for (const intent of [
      "suggest_date",
      "vote_date",
      "delete_date",
      "vote_restaurant",
      "unvote_restaurant",
    ]) {
      const db = createMockDb({ activePoll: null });
      const result = await action({
        request: createRequest({ _action: intent, suggestion_id: "1", suggested_date: "2099-01-01" }),
        context: { cloudflare: { env: { DB: db } } } as never,
      } as never);
      expect(result).toEqual({ error: "No active poll. Actions require an active poll." });
      expect(db.runCalls).toEqual([]);
    }
  });
});

describe("dashboard._index poll actions — suggest_date", () => {
  it("requires a date", async () => {
    const db = createMockDb();
    const result = await action({
      request: createRequest({ _action: "suggest_date" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ error: "Date is required" });
    expect(db.runCalls).toEqual([]);
  });

  it("rejects past dates", async () => {
    const db = createMockDb();
    const result = await action({
      request: createRequest({ _action: "suggest_date", suggested_date: "2000-01-01" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ error: "Cannot add dates in the past" });
    expect(db.runCalls).toEqual([]);
  });

  it("rejects duplicate dates in the current poll", async () => {
    const db = createMockDb({ existingDate: { id: 999 } });
    const result = await action({
      request: createRequest({ _action: "suggest_date", suggested_date: "2099-01-01" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ error: "This date has already been added for the current poll" });
    expect(db.runCalls).toEqual([]);
  });

  it("inserts the suggestion, auto-votes, logs, and returns ok", async () => {
    const db = createMockDb({ insertSuggestionId: 777 });
    const result = await action({
      request: createRequest({ _action: "suggest_date", suggested_date: "2099-01-01" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO date_suggestions"),
        bindArgs: [123, 1, "2099-01-01"],
      }),
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO date_votes"),
        bindArgs: [1, 777, 123],
      }),
    ]);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 123, actionType: "suggest_date" }),
    );
  });
});

describe("dashboard._index poll actions — vote_date", () => {
  it("rejects new votes on past dates", async () => {
    const db = createMockDb({
      suggestion: { id: 10, poll_id: 1, suggested_date: "2000-01-01" },
    });
    const result = await action({
      request: createRequest({ _action: "vote_date", suggestion_id: "10", remove: "false" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ error: "Cannot vote on dates in the past" });
    expect(db.runCalls).toEqual([]);
  });

  it("removes a vote even on a past date when remove=true", async () => {
    const db = createMockDb({
      suggestion: { id: 10, poll_id: 1, suggested_date: "2000-01-01" },
    });
    const result = await action({
      request: createRequest({ _action: "vote_date", suggestion_id: "10", remove: "true" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("DELETE FROM date_votes"),
        bindArgs: [1, "10", 123],
      }),
    ]);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "unvote_date" }),
    );
  });

  it("rejects when the suggestion is from a different poll", async () => {
    const db = createMockDb({
      suggestion: { id: 10, poll_id: 99, suggested_date: "2099-01-01" },
    });
    const result = await action({
      request: createRequest({ _action: "vote_date", suggestion_id: "10", remove: "false" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ error: "Suggestion not found in active poll" });
    expect(db.runCalls).toEqual([]);
  });

  it("inserts a new vote when one does not exist", async () => {
    const db = createMockDb({
      suggestion: { id: 10, poll_id: 1, suggested_date: "2099-01-01" },
    });
    const result = await action({
      request: createRequest({ _action: "vote_date", suggestion_id: "10", remove: "false" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO date_votes"),
        bindArgs: [1, "10", 123],
      }),
    ]);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "vote_date" }),
    );
  });
});

describe("dashboard._index poll actions — delete_date", () => {
  it("blocks non-owner non-admin", async () => {
    const db = createMockDb({ dateOwner: { user_id: 999, poll_id: 1 } });
    const result = await action({
      request: createRequest({ _action: "delete_date", suggestion_id: "10" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ error: "Permission denied" });
    expect(db.runCalls).toEqual([]);
  });

  it("allows the owner to delete their own suggestion", async () => {
    const db = createMockDb({ dateOwner: { user_id: 123, poll_id: 1 } });
    const result = await action({
      request: createRequest({ _action: "delete_date", suggestion_id: "10" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("DELETE FROM date_votes"),
        bindArgs: ["10"],
      }),
      expect.objectContaining({
        sql: expect.stringContaining("DELETE FROM date_suggestions"),
        bindArgs: ["10"],
      }),
    ]);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "delete_date" }),
    );
  });

  it("allows admins to delete a suggestion they don't own", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 999,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as never);
    const db = createMockDb({ dateOwner: { user_id: 123, poll_id: 1 } });
    const result = await action({
      request: createRequest({ _action: "delete_date", suggestion_id: "10" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "delete_date" }),
    );
  });
});

describe("dashboard._index poll actions — vote_restaurant", () => {
  it("requires a restaurant id", async () => {
    const db = createMockDb();
    const result = await action({
      request: createRequest({ _action: "vote_restaurant" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ error: "Restaurant ID is required" });
    expect(voteForRestaurant).not.toHaveBeenCalled();
  });

  it("records vote and flags 'changed' when an existing vote was found", async () => {
    const db = createMockDb({ existingRestaurantVote: { restaurant_id: 5 } });
    const result = await action({
      request: createRequest({ _action: "vote_restaurant", suggestion_id: "9" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(voteForRestaurant).toHaveBeenCalledWith(expect.anything(), 1, 9, 123);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "vote_restaurant",
        actionDetails: expect.objectContaining({ changed: true }),
      }),
    );
  });

  it("records vote with changed=false when there was no prior vote", async () => {
    const db = createMockDb({ existingRestaurantVote: null });
    const result = await action({
      request: createRequest({ _action: "vote_restaurant", suggestion_id: "9" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "vote_restaurant",
        actionDetails: expect.objectContaining({ changed: false }),
      }),
    );
  });
});

describe("dashboard._index poll actions — unvote_restaurant", () => {
  it("removes vote and logs", async () => {
    const db = createMockDb();
    const result = await action({
      request: createRequest({ _action: "unvote_restaurant" }),
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(removeVote).toHaveBeenCalledWith(expect.anything(), 1, 123);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "unvote_restaurant" }),
    );
  });
});
