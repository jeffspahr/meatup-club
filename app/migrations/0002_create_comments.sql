-- Migration: Create comments table for polls and events
-- Created: 2025-12-26

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  commentable_type TEXT NOT NULL,
  commentable_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_commentable ON comments(commentable_type, commentable_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
