import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceRateLimit } from "./rate-limit.server";

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

function createMockDb({
  requestCount = 1,
  failOnInsert = false,
  failOnSelect = false,
  failOnCleanup = false,
}: {
  requestCount?: number;
  failOnInsert?: boolean;
  failOnSelect?: boolean;
  failOnCleanup?: boolean;
} = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const firstCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  return {
    runCalls,
    firstCalls,
    prepare: vi.fn((sql: string) => {
      const normalizedSql = normalizeSql(sql);

      return {
        bind: (...bindArgs: unknown[]) => ({
          run: async () => {
            runCalls.push({ sql: normalizedSql, bindArgs });

            if (
              failOnInsert &&
              normalizedSql.includes("INSERT INTO api_rate_limits")
            ) {
              throw new Error("insert failed");
            }

            if (
              failOnCleanup &&
              normalizedSql === "DELETE FROM api_rate_limits WHERE expires_at < ?"
            ) {
              throw new Error("cleanup failed");
            }

            return { meta: { changes: 1, last_row_id: 0 } };
          },
          first: async () => {
            firstCalls.push({ sql: normalizedSql, bindArgs });

            if (
              failOnSelect &&
              normalizedSql.includes("SELECT request_count")
            ) {
              throw new Error("select failed");
            }

            return { request_count: requestCount };
          },
        }),
      };
    }),
  };
}

describe("rate-limit.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_123_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the remaining quota and schedules cleanup with waitUntil", async () => {
    const db = createMockDb({ requestCount: 3 });
    const waitUntil = vi.fn();

    const result = await enforceRateLimit({
      db: db as never,
      scope: "places-search",
      identifier: "user:42",
      limit: 5,
      windowSeconds: 60,
      ctx: { waitUntil } as never,
    });

    expect(db.runCalls).toEqual(
      expect.arrayContaining([
        {
          sql: expect.stringContaining("INSERT INTO api_rate_limits"),
          bindArgs: ["places-search", "user:42", 1_700_000_100, 1_700_000_220],
        },
        {
          sql: "DELETE FROM api_rate_limits WHERE expires_at < ?",
          bindArgs: [1_700_000_123],
        },
      ])
    );
    expect(db.firstCalls).toEqual([
      {
        sql: expect.stringContaining("SELECT request_count"),
        bindArgs: ["places-search", "user:42", 1_700_000_100],
      },
    ]);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
    expect(result).toEqual({
      allowed: true,
      remaining: 2,
      resetAt: 1_700_000_160,
    });
  });

  it("returns a blocked result when the limit is exceeded and cleanup still fails safely", async () => {
    const db = createMockDb({ requestCount: 7, failOnCleanup: true });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await enforceRateLimit({
      db: db as never,
      scope: "places-details",
      identifier: "ip:203.0.113.10",
      limit: 5,
      windowSeconds: 60,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "rate_limit_cleanup_failed",
      errorName: "Error",
    });
    expect(result).toEqual({
      allowed: false,
      remaining: 0,
      resetAt: 1_700_000_160,
    });
  });

  it("fails open when the rate-limit check itself errors", async () => {
    const db = createMockDb({ failOnInsert: true });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await enforceRateLimit({
      db: db as never,
      scope: "places-photo",
      identifier: "user:99",
      limit: 10,
      windowSeconds: 60,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "rate_limit_check_failed",
      errorName: "Error",
    });
    expect(result).toEqual({
      allowed: true,
      remaining: 10,
      resetAt: 1_700_000_160,
    });
  });

  it("fails open when reading the stored request count errors", async () => {
    const db = createMockDb({ failOnSelect: true });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await enforceRateLimit({
      db: db as never,
      scope: "places-search",
      identifier: "user:17",
      limit: 4,
      windowSeconds: 60,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "rate_limit_check_failed",
      errorName: "Error",
    });
    expect(result).toEqual({
      allowed: true,
      remaining: 4,
      resetAt: 1_700_000_160,
    });
  });
});
