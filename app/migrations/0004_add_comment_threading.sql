-- Add parent_id for comment threading
ALTER TABLE comments ADD COLUMN parent_id INTEGER DEFAULT NULL;

-- Add foreign key constraint
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
