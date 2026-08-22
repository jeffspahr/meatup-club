import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "./dashboard.admin.polls";
import { requireActiveUser } from "../lib/auth.server";
import { getActivePollLeaders } from "../lib/polls.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/polls.server", () => ({
  getActivePollLeaders: vi.fn(),
}));

function createMockDb() {
  const calls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => ({
    bind: (...bindArgs: unknown[]) => ({
      all: async () => {
        calls.push({ sql, bindArgs });
        if (sql.includes("FROM restaurants r")) {
          return {
            results: [
              { id: 10, name: "Prime", address: "123 Main", vote_count: 4 },
            ],
          };
        }
        if (sql.includes("FROM date_suggestions ds")) {
          return {
            results: [
              { id: 20, suggested_date: "2027-02-08", vote_count: 3 },
            ],
          };
        }
        throw new Error(`Unexpected bound query: ${sql}`);
      },
    }),
    all: async () => {
      calls.push({ sql, bindArgs: [] });
      if (sql.includes("WHERE p.status = 'closed'")) {
        return { results: [{ id: 9, title: "Previous poll" }] };
      }
      throw new Error(`Unexpected unbound query: ${sql}`);
    },
  }));

  return { prepare, calls };
}

describe("dashboard admin polls loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
    } as any);
  });

  it("redirects non-admin users before querying poll data", async () => {
    const db = createMockDb();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 7,
      is_admin: 0,
      status: "active",
    } as any);

    const response = await loader({
      request: new Request("http://localhost/dashboard/admin/polls"),
      context: { cloudflare: { env: { DB: db } } } as any,
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard");
    expect(getActivePollLeaders).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("loads override options scoped to the active poll", async () => {
    const db = createMockDb();
    const leaders = {
      activePoll: { id: 42, title: "Q1 poll" },
      topRestaurant: { id: 10, name: "Prime", vote_count: 4 },
      topDate: { id: 20, suggested_date: "2027-02-08", vote_count: 3 },
    };
    vi.mocked(getActivePollLeaders).mockResolvedValue(leaders as any);

    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/polls"),
      context: { cloudflare: { env: { DB: db } } } as any,
    } as any);

    expect(result).toMatchObject({
      ...leaders,
      allRestaurants: [{ id: 10, name: "Prime", vote_count: 4 }],
      allDates: [{ id: 20, suggested_date: "2027-02-08", vote_count: 3 }],
      closedPolls: [{ id: 9, title: "Previous poll" }],
    });

    const restaurantQuery = db.calls.find(({ sql }) =>
      sql.includes("FROM restaurants r")
    );
    const dateQuery = db.calls.find(({ sql }) =>
      sql.includes("FROM date_suggestions ds")
    );
    expect(restaurantQuery?.bindArgs).toEqual([42, 42]);
    expect(dateQuery?.bindArgs).toEqual([42]);
    expect(dateQuery?.sql).toContain("WHERE ds.poll_id = ?");
  });

  it("skips option queries when there is no active poll", async () => {
    const db = createMockDb();
    vi.mocked(getActivePollLeaders).mockResolvedValue({
      activePoll: null,
      topRestaurant: null,
      topDate: null,
    } as any);

    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/polls"),
      context: { cloudflare: { env: { DB: db } } } as any,
    } as any);

    expect(result).toMatchObject({
      activePoll: null,
      allRestaurants: [],
      allDates: [],
    });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].sql).toContain("WHERE p.status = 'closed'");
  });
});
