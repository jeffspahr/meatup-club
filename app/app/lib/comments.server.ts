/**
 * Comment utilities for polls and events
 * Server-side only
 */

import type { D1Database } from "@cloudflare/workers-types";

export type CommentableType = 'poll' | 'event';

export interface Comment {
  id: number;
  user_id: number;
  commentable_type: string;
  commentable_id: number;
  content: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
  user_picture?: string;
}

/**
 * Get comments for a poll or event
 */
export async function getComments(
  db: D1Database,
  commentableType: CommentableType,
  commentableId: number
): Promise<Comment[]> {
  const result = await db
    .prepare(`
      SELECT
        c.*,
        u.name as user_name,
        u.email as user_email,
        u.picture as user_picture
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.commentable_type = ? AND c.commentable_id = ?
      ORDER BY c.created_at ASC
    `)
    .bind(commentableType, commentableId)
    .all();

  return (result.results as Comment[]) || [];
}

/**
 * Create a new comment
 */
export async function createComment(
  db: D1Database,
  userId: number,
  commentableType: CommentableType,
  commentableId: number,
  content: string
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO comments (user_id, commentable_type, commentable_id, content)
      VALUES (?, ?, ?, ?)
    `)
    .bind(userId, commentableType, commentableId, content)
    .run();
}

/**
 * Delete a comment (user can delete own comments, admins can delete any)
 */
export async function deleteComment(
  db: D1Database,
  commentId: number,
  userId: number,
  isAdmin: boolean
): Promise<boolean> {
  // Check ownership if not admin
  if (!isAdmin) {
    const comment = await db
      .prepare('SELECT user_id FROM comments WHERE id = ?')
      .bind(commentId)
      .first();

    if (!comment || comment.user_id !== userId) {
      return false;
    }
  }

  await db
    .prepare('DELETE FROM comments WHERE id = ?')
    .bind(commentId)
    .run();

  return true;
}

/**
 * Get comment count for a poll or event
 */
export async function getCommentCount(
  db: D1Database,
  commentableType: CommentableType,
  commentableId: number
): Promise<number> {
  const result = await db
    .prepare(`
      SELECT COUNT(*) as count
      FROM comments
      WHERE commentable_type = ? AND commentable_id = ?
    `)
    .bind(commentableType, commentableId)
    .first();

  return result?.count as number || 0;
}
