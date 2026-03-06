import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActivityStats,
  getAllActivity,
  getUserActivity,
  logActivity,
} from "./activity.server";

type QueryDbOptions = {
  throwOnRun?: Error | null;
  userActivity?: Array<Record<string, unknown>>;
  allActivity?: Array<Record<string, unknown>>;
  totalCount?: number | null;
  byType?: Array<Record<string, unknown>>;
  recentLogins?: number | null;
  mostActiveUsers?: Array<Record<string, unknown>>;
};

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

function createQueryDb({
  throwOnRun = null,
  userActivity = [],
  allActivity = [],
  totalCount = 0,
  byType = [],
  recentLogins = 0,
  mostActiveUsers = [],
}: QueryDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = normalizeSql(sql);

    const firstResult = async () => {
      if (normalizedSql === "SELECT COUNT(*) as count FROM activity_log") {
        return totalCount === null ? null : { count: totalCount };
      }

      if (normalizedSql.includes("COUNT(DISTINCT user_id) as count")) {
        return recentLogins === null ? null : { count: recentLogins };
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allResult = async () => {
      if (
        normalizedSql.includes("COUNT(a.id) as activity_count") &&
        normalizedSql.includes("WHERE a.created_at > datetime('now', '-30 days')")
      ) {
        return { results: mostActiveUsers };
      }

      if (normalizedSql.includes("FROM activity_log WHERE user_id = ?")) {
        return { results: userActivity };
      }

      if (normalizedSql.includes("FROM activity_log a JOIN users u")) {
        return { results: allActivity };
      }

      if (normalizedSql.includes("SELECT action_type, COUNT(*) as count")) {
        return { results: byType };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    const run = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });

      if (throwOnRun) {
        throw throwOnRun;
      }

      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstResult(),
      all: () => allResult(),
      bind: (...bindArgs: unknown[]) => ({
        run: () => run(bindArgs),
        first: () => firstResult(),
        all: () => allResult(),
      }),
    };
  });

  return { prepare, runCalls };
}

describe("activity.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs activity with serialized details and request metadata", async () => {
    const db = createQueryDb();

    await logActivity({
      db: db as never,
      userId: 42,
      actionType: "vote_date",
      actionDetails: { pollId: 7, dateId: 11 },
      route: "/dashboard/polls",
      request: new Request("http://localhost/dashboard/polls", {
        headers: {
          "CF-Connecting-IP": "203.0.113.10",
          "User-Agent": "Vitest Browser",
        },
      }),
    });

    expect(db.runCalls).toEqual([
      {
        sql: expect.stringContaining("INSERT INTO activity_log"),
        bindArgs: [
          42,
          "vote_date",
          JSON.stringify({ pollId: 7, dateId: 11 }),
          "/dashboard/polls",
          "203.0.113.10",
          "Vitest Browser",
        ],
      },
    ]);
  });

  it("swallows logging failures so analytics issues do not break the app", async () => {
    const db = createQueryDb({ throwOnRun: new Error("db unavailable") });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await logActivity({
      db: db as never,
      userId: 42,
      actionType: "logout",
      actionDetails: "manual logout",
      route: "/logout",
      request: new Request("http://localhost/logout", {
        headers: {
          "X-Forwarded-For": "198.51.100.22",
        },
      }),
    });

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to log activity:",
      expect.any(Error)
    );
  });

  it("returns user-scoped activity rows", async () => {
    const db = createQueryDb({
      userActivity: [
        {
          id: 1,
          action_type: "comment",
          action_details: '{"commentId":4}',
          route: "/dashboard/polls",
          ip_address: "203.0.113.10",
          created_at: "2026-03-06 12:00:00",
        },
      ],
    });

    const result = await getUserActivity(db as never, 42, 25);

    expect(result).toEqual([
      {
        id: 1,
        action_type: "comment",
        action_details: '{"commentId":4}',
        route: "/dashboard/polls",
        ip_address: "203.0.113.10",
        created_at: "2026-03-06 12:00:00",
      },
    ]);
  });

  it("returns recent cross-user activity rows and defaults to an empty list", async () => {
    const filledDb = createQueryDb({
      allActivity: [
        {
          id: 2,
          user_id: 42,
          action_type: "login",
          user_name: "Member",
          user_email: "member@example.com",
        },
      ],
    });
    const emptyDb = createQueryDb({ allActivity: [] });

    await expect(getAllActivity(filledDb as never, 10, 5)).resolves.toEqual([
      {
        id: 2,
        user_id: 42,
        action_type: "login",
        user_name: "Member",
        user_email: "member@example.com",
      },
    ]);
    await expect(getAllActivity(emptyDb as never)).resolves.toEqual([]);
  });

  it("returns activity summary stats with safe zero defaults", async () => {
    const populatedDb = createQueryDb({
      totalCount: 18,
      byType: [
        { action_type: "login", count: 7 },
        { action_type: "vote_date", count: 5 },
      ],
      recentLogins: 4,
      mostActiveUsers: [
        {
          id: 42,
          name: "Member",
          email: "member@example.com",
          activity_count: 9,
        },
      ],
    });
    const emptyDb = createQueryDb({
      totalCount: null,
      byType: [],
      recentLogins: null,
      mostActiveUsers: [],
    });

    await expect(getActivityStats(populatedDb as never)).resolves.toEqual({
      total: 18,
      byType: [
        { action_type: "login", count: 7 },
        { action_type: "vote_date", count: 5 },
      ],
      recentLogins: 4,
      mostActiveUsers: [
        {
          id: 42,
          name: "Member",
          email: "member@example.com",
          activity_count: 9,
        },
      ],
    });
    await expect(getActivityStats(emptyDb as never)).resolves.toEqual({
      total: 0,
      byType: [],
      recentLogins: 0,
      mostActiveUsers: [],
    });
  });
});
