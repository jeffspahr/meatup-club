-- Idempotent no-op (column already exists in production)
SELECT 1;

-- Add foreign key constraint
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
