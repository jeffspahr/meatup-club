import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.polls";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

function createMockDb({
  activePollId,
  suggestionPollId,
}: {
  activePollId: number;
  suggestionPollId: number;
}) {
  const run = vi.fn(async () => ({ meta: { changes: 0 } }));

  const prepare = vi.fn((sql: string) => {
    const firstForArgs = async (args: unknown[]) => {
      if (sql.includes("SELECT id FROM polls WHERE status = 'active'")) {
        return { id: activePollId };
      }

      if (sql.includes("SELECT id, poll_id, suggested_date FROM date_suggestions")) {
        return { id: 999, poll_id: suggestionPollId, suggested_date: "2026-05-01" };
      }

      if (sql.includes("SELECT user_id, poll_id FROM date_suggestions")) {
        return { user_id: 123, poll_id: suggestionPollId };
      }

      throw new Error(`Unexpected SQL in first(): ${sql} [${JSON.stringify(args)}]`);
    };

    return {
      first: () => firstForArgs([]),
      run,
      all: async () => ({ results: [] }),
      bind: (...args: unknown[]) => ({
        first: () => firstForArgs(args),
        run,
        all: async () => ({ results: [] }),
      }),
    };
  });

  return { prepare, run };
}

describe("dashboard.polls action security guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "user@example.com",
      name: "User",
    } as any);
  });

  it("rejects date votes when suggestion is outside the active poll", async () => {
    const db = createMockDb({ activePollId: 1, suggestionPollId: 2 });
    const formData = new FormData();
    formData.set("_action", "vote_date");
    formData.set("suggestion_id", "999");
    formData.set("remove", "false");

    const request = new Request("http://localhost/dashboard/polls", {
      method: "POST",
      body: formData,
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as any,
    } as any);

    expect(result).toEqual({ error: "Suggestion not found in active poll" });
    expect(db.run).not.toHaveBeenCalled();
  });

  it("rejects date deletion when suggestion is outside the active poll", async () => {
    const db = createMockDb({ activePollId: 1, suggestionPollId: 2 });
    const formData = new FormData();
    formData.set("_action", "delete_date");
    formData.set("suggestion_id", "999");

    const request = new Request("http://localhost/dashboard/polls", {
      method: "POST",
      body: formData,
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as any,
    } as any);

    expect(result).toEqual({ error: "Suggestion not found in active poll" });
    expect(db.run).not.toHaveBeenCalled();
  });
});
