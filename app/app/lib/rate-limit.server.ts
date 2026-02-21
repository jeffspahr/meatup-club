import type { ExecutionContext } from "@cloudflare/workers-types";
import type { D1Database } from "./db.server";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function enforceRateLimit({
  db,
  scope,
  identifier,
  limit,
  windowSeconds = 60,
  ctx,
}: {
  db: D1Database;
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds?: number;
  ctx?: ExecutionContext;
}): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const expiresAt = windowStart + windowSeconds * 2;

  try {
    await db
      .prepare(
        `
          INSERT INTO api_rate_limits (scope, identifier, window_start, request_count, expires_at)
          VALUES (?, ?, ?, 1, ?)
          ON CONFLICT(scope, identifier, window_start)
          DO UPDATE SET
            request_count = request_count + 1,
            expires_at = excluded.expires_at
        `
      )
      .bind(scope, identifier, windowStart, expiresAt)
      .run();

    const row = await db
      .prepare(
        `
          SELECT request_count
          FROM api_rate_limits
          WHERE scope = ? AND identifier = ? AND window_start = ?
        `
      )
      .bind(scope, identifier, windowStart)
      .first();

    const used = Number(row?.request_count || 0);

    const cleanupPromise = db
      .prepare("DELETE FROM api_rate_limits WHERE expires_at < ?")
      .bind(now)
      .run()
      .catch((error: unknown) => {
        console.error("Rate limit cleanup failed:", error);
      });

    if (ctx?.waitUntil) {
      ctx.waitUntil(cleanupPromise);
    } else {
      await cleanupPromise;
    }

    return {
      allowed: used <= limit,
      remaining: Math.max(0, limit - used),
      resetAt: windowStart + windowSeconds,
    };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    return {
      allowed: true,
      remaining: limit,
      resetAt: windowStart + windowSeconds,
    };
  }
}
