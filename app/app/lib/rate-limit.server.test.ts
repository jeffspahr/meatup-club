import { beforeEach, describe, expect, it, vi } from "vitest";
import { enforceRateLimit } from "./rate-limit.server";

function createRateLimitDb({
  requestCount,
  insertError,
}: {
  requestCount: number;
  insertError?: Error;
}) {
  const insertRun = insertError
    ? vi.fn().mockRejectedValue(insertError)
    : vi.fn().mockResolvedValue({ meta: { changes: 1 } });
  const selectFirst = vi.fn().mockResolvedValue({
    request_count: requestCount,
  });
  const cleanupRun = vi.fn().mockResolvedValue({ meta: { changes: 0 } });
  const binds: Array<{ sql: string; args: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => {
      binds.push({ sql, args });

      if (sql.includes("INSERT INTO api_rate_limits")) {
        return { run: insertRun };
      }
      if (sql.includes("SELECT request_count")) {
        return { first: selectFirst };
      }
      if (sql.includes("DELETE FROM api_rate_limits")) {
        return { run: cleanupRun };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
  }));

  return {
    db: { prepare } as never,
    binds,
    cleanupRun,
  };
}

describe("enforceRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
  });

  it("allows the request at the limit and reports no remaining capacity", async () => {
    const { db } = createRateLimitDb({ requestCount: 3 });

    await expect(
      enforceRateLimit({
        db,
        scope: "places.search",
        identifier: "user:1",
        limit: 3,
        windowSeconds: 60,
      })
    ).resolves.toEqual({
      allowed: true,
      remaining: 0,
      resetAt: 1767225780,
    });
  });

  it("rejects the first request beyond the limit", async () => {
    const { db } = createRateLimitDb({ requestCount: 4 });

    const result = await enforceRateLimit({
      db,
      scope: "places.search",
      identifier: "user:1",
      limit: 3,
      windowSeconds: 60,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("starts a fresh fixed window at the boundary and schedules cleanup", async () => {
    const { db, binds, cleanupRun } = createRateLimitDb({ requestCount: 1 });
    const waitUntil = vi.fn();

    const result = await enforceRateLimit({
      db,
      scope: "places.search",
      identifier: "user:1",
      limit: 3,
      windowSeconds: 60,
      ctx: { waitUntil } as any,
    });

    expect(result).toEqual({
      allowed: true,
      remaining: 2,
      resetAt: 1767225780,
    });
    expect(
      binds.find(({ sql }) => sql.includes("INSERT INTO api_rate_limits"))?.args
    ).toEqual(["places.search", "user:1", 1767225720, 1767225840]);
    expect(
      binds.find(({ sql }) => sql.includes("DELETE FROM api_rate_limits"))?.args
    ).toEqual([1767225720]);
    expect(cleanupRun).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
  });

  it("fails open when persistence is unavailable", async () => {
    const { db } = createRateLimitDb({
      requestCount: 0,
      insertError: new Error("D1 unavailable"),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      enforceRateLimit({
        db,
        scope: "places.search",
        identifier: "user:1",
        limit: 30,
        windowSeconds: 60,
      })
    ).resolves.toEqual({
      allowed: true,
      remaining: 30,
      resetAt: 1767225780,
    });
    expect(console.error).toHaveBeenCalledWith(
      "Rate limit check failed:",
      expect.any(Error)
    );
  });
});
