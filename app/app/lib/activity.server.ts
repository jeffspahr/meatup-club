/**
 * Activity logging utilities for user analytics
 * Server-side only - tracks user actions for admin analytics
 */

import type { D1Database } from "@cloudflare/workers-types";

export type ActivityType =
  | 'login'
  | 'logout'
  | 'page_view'
  | 'vote_date'
  | 'unvote_date'
  | 'suggest_date'
  | 'delete_date'
  | 'vote_restaurant'
  | 'unvote_restaurant'
  | 'suggest_restaurant'
  | 'delete_restaurant'
  | 'rsvp'
  | 'update_rsvp'
  | 'admin_override_rsvp'
  | 'comment'
  | 'delete_comment';

export interface LogActivityParams {
  db: D1Database;
  userId: number;
  actionType: ActivityType;
  actionDetails?: string | object;
  route?: string;
  request?: Request;
}

/**
 * Log a user activity to the activity_log table
 */
export async function logActivity({
  db,
  userId,
  actionType,
  actionDetails,
  route,
  request,
}: LogActivityParams): Promise<void> {
  try {
    // Convert actionDetails to JSON string if it's an object
    const detailsString = typeof actionDetails === 'object'
      ? JSON.stringify(actionDetails)
      : actionDetails;

    // Extract IP and User-Agent from request if provided
    const ipAddress = request?.headers.get('CF-Connecting-IP') ||
                      request?.headers.get('X-Forwarded-For') ||
                      null;
    const userAgent = request?.headers.get('User-Agent') || null;

    await db
      .prepare(`
        INSERT INTO activity_log (
          user_id,
          action_type,
          action_details,
          route,
          ip_address,
          user_agent
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        userId,
        actionType,
        detailsString || null,
        route || null,
        ipAddress,
        userAgent
      )
      .run();
  } catch (error) {
    // Log error but don't throw - activity logging should never break the app
    console.error('Failed to log activity:', error);
  }
}

/**
 * Get activity log for a specific user
 */
export async function getUserActivity(
  db: D1Database,
  userId: number,
  limit: number = 100
) {
  const result = await db
    .prepare(`
      SELECT
        id,
        action_type,
        action_details,
        route,
        ip_address,
        created_at
      FROM activity_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(userId, limit)
    .all();

  return result.results || [];
}

/**
 * Get recent activity across all users (admin only)
 */
export async function getAllActivity(
  db: D1Database,
  limit: number = 100,
  offset: number = 0
) {
  const result = await db
    .prepare(`
      SELECT
        a.id,
        a.user_id,
        a.action_type,
        a.action_details,
        a.route,
        a.ip_address,
        a.created_at,
        u.name as user_name,
        u.email as user_email
      FROM activity_log a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .bind(limit, offset)
    .all();

  return result.results || [];
}

/**
 * Get activity summary statistics (admin only)
 */
export async function getActivityStats(db: D1Database) {
  // Total activities
  const totalResult = await db
    .prepare('SELECT COUNT(*) as count FROM activity_log')
    .first();

  // Activities by type
  const byTypeResult = await db
    .prepare(`
      SELECT action_type, COUNT(*) as count
      FROM activity_log
      GROUP BY action_type
      ORDER BY count DESC
    `)
    .all();

  // Recent logins (last 7 days)
  const recentLoginsResult = await db
    .prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM activity_log
      WHERE action_type = 'login'
      AND created_at > datetime('now', '-7 days')
    `)
    .first();

  // Most active users (last 30 days)
  const activeUsersResult = await db
    .prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        COUNT(a.id) as activity_count
      FROM activity_log a
      JOIN users u ON a.user_id = u.id
      WHERE a.created_at > datetime('now', '-30 days')
      GROUP BY u.id, u.name, u.email
      ORDER BY activity_count DESC
      LIMIT 10
    `)
    .all();

  return {
    total: (totalResult?.count as number) || 0,
    byType: byTypeResult.results || [],
    recentLogins: (recentLoginsResult?.count as number) || 0,
    mostActiveUsers: activeUsersResult.results || [],
  };
}
