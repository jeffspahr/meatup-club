import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.polls";
import { requireActiveUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

type MockDbOptions = {
  activePoll?: { id: number } | null;
  existingDate?: { id: number } | null;
  suggestion?: { id: number; poll_id: number; suggested_date: string } | null;
  existingVote?: { id: number } | null;
  dateOwner?: { user_id: number; poll_id: number } | null;
  insertSuggestionId?: number | null;
};

function createMockDb({
  activePoll = { id: 1 },
  existingDate = null,
  suggestion = { id: 10, poll_id: 1, suggested_date: "2099-01-01" },
  existingVote = null,
  dateOwner = { user_id: 123, poll_id: 1 },
  insertSuggestionId = 555,
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

  return new Request("http://localhost/dashboard/polls", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.polls date action flows", () => {
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
  });

  it("returns an error when no active poll exists", async () => {
    const db = createMockDb({ activePoll: null });
    const request = createRequest({
      _action: "suggest_date",
      suggested_date: "2099-01-01",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "No active poll. Actions require an active poll." });
    expect(db.runCalls).toEqual([]);
  });

  it("validates required dates before inserting a suggestion", async () => {
    const db = createMockDb();
    const request = createRequest({ _action: "suggest_date" });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Date is required" });
    expect(db.runCalls).toEqual([]);
  });

  it("rejects duplicate dates in the current poll", async () => {
    const db = createMockDb({ existingDate: { id: 999 } });
    const request = createRequest({
      _action: "suggest_date",
      suggested_date: "2099-01-01",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "This date has already been added for the current poll" });
    expect(db.runCalls).toEqual([]);
  });

  it("creates a new date suggestion, auto-votes for it, and redirects", async () => {
    const db = createMockDb({ insertSuggestionId: 777 });
    const request = createRequest({
      _action: "suggest_date",
      suggested_date: "2099-01-01",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/polls");
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
      expect.objectContaining({
        userId: 123,
        actionType: "suggest_date",
      })
    );
  });

  it("prevents new votes on past dates", async () => {
    const db = createMockDb({
      suggestion: { id: 10, poll_id: 1, suggested_date: "2000-01-01" },
    });
    const request = createRequest({
      _action: "vote_date",
      suggestion_id: "10",
      remove: "false",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Cannot vote on dates in the past" });
    expect(db.runCalls).toEqual([]);
  });

  it("removes an existing vote and redirects when remove=true", async () => {
    const db = createMockDb({
      suggestion: { id: 10, poll_id: 1, suggested_date: "2099-01-01" },
    });
    const request = createRequest({
      _action: "vote_date",
      suggestion_id: "10",
      remove: "true",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect((response as Response).status).toBe(302);
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("DELETE FROM date_votes"),
        bindArgs: [1, "10", 123],
      }),
    ]);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 123,
        actionType: "unvote_date",
      })
    );
  });

  it("rejects deleting a date suggestion owned by another non-admin user", async () => {
    const db = createMockDb({
      dateOwner: { user_id: 999, poll_id: 1 },
    });
    const request = createRequest({
      _action: "delete_date",
      suggestion_id: "10",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Permission denied" });
    expect(db.runCalls).toEqual([]);
  });

  it("deletes a user's own date suggestion and redirects", async () => {
    const db = createMockDb({
      dateOwner: { user_id: 123, poll_id: 1 },
    });
    const request = createRequest({
      _action: "delete_date",
      suggestion_id: "10",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect((response as Response).status).toBe(302);
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
      expect.objectContaining({
        userId: 123,
        actionType: "delete_date",
      })
    );
  });
});
