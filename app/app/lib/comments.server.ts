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
  parent_id?: number | null;
  user_name?: string;
  user_email?: string;
  user_picture?: string;
  replies?: Comment[];
}

/**
 * Get comments for a poll or event, organized into threads
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

  const allComments = (result.results as Comment[]) || [];

  // Build threaded structure
  const commentMap = new Map<number, Comment>();
  const rootComments: Comment[] = [];

  // First pass: create map and initialize replies array
  allComments.forEach(comment => {
    comment.replies = [];
    commentMap.set(comment.id, comment);
  });

  // Second pass: organize into threads
  allComments.forEach(comment => {
    if (comment.parent_id) {
      const parent = commentMap.get(comment.parent_id);
      if (parent) {
        parent.replies!.push(comment);
      } else {
        // Parent not found, treat as root
        rootComments.push(comment);
      }
    } else {
      rootComments.push(comment);
    }
  });

  return rootComments;
}

/**
 * Create a new comment or reply
 */
export async function createComment(
  db: D1Database,
  userId: number,
  commentableType: CommentableType,
  commentableId: number,
  content: string,
  parentId?: number | null
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO comments (user_id, commentable_type, commentable_id, content, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(userId, commentableType, commentableId, content, parentId || null)
    .run();
}

/**
 * Delete a comment and all its replies (user can delete own comments, admins can delete any)
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

  // Delete all nested replies first (recursive delete)
  await deleteCommentAndReplies(db, commentId);

  return true;
}

/**
 * Recursively delete a comment and all its replies
 */
async function deleteCommentAndReplies(
  db: D1Database,
  commentId: number
): Promise<void> {
  // Get all direct replies
  const replies = await db
    .prepare('SELECT id FROM comments WHERE parent_id = ?')
    .bind(commentId)
    .all();

  // Delete all replies recursively
  for (const reply of (replies.results || [])) {
    await deleteCommentAndReplies(db, (reply as any).id);
  }

  // Delete the comment itself
  await db
    .prepare('DELETE FROM comments WHERE id = ?')
    .bind(commentId)
    .run();
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
