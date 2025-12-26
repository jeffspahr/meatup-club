-- Migration 007: Refactor date voting system
-- Date suggestions require an active poll
-- Users can vote for multiple dates (indicating availability)

-- Step 1: Create new date_votes table with poll_id
-- Key difference from restaurant_votes: no unique constraint on (poll_id, user_id)
-- This allows users to vote for multiple dates per poll
CREATE TABLE date_votes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  date_suggestion_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (date_suggestion_id) REFERENCES date_suggestions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  -- Allow multiple votes per user per poll (for different dates)
  UNIQUE(poll_id, date_suggestion_id, user_id)
);

-- Step 2: Migrate existing votes
-- For each existing vote, we need to figure out which poll it belongs to
INSERT INTO date_votes_new (id, poll_id, date_suggestion_id, user_id, created_at)
SELECT
  dv.id,
  COALESCE(ds.poll_id, (SELECT id FROM polls ORDER BY id DESC LIMIT 1)) as poll_id,
  dv.date_suggestion_id,
  dv.user_id,
  dv.created_at
FROM date_votes dv
LEFT JOIN date_suggestions ds ON dv.date_suggestion_id = ds.id
WHERE COALESCE(ds.poll_id, (SELECT id FROM polls ORDER BY id DESC LIMIT 1)) IS NOT NULL;

-- Step 3: Drop old table and rename new one
DROP TABLE date_votes;
ALTER TABLE date_votes_new RENAME TO date_votes;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_date_votes_suggestion_id ON date_votes(date_suggestion_id);
CREATE INDEX IF NOT EXISTS idx_date_votes_poll_id ON date_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_date_votes_user_id ON date_votes(user_id);

-- Step 5: Date suggestions should require a poll_id (will be enforced in app logic)
-- We keep poll_id nullable for backward compatibility but app will enforce it

-- Step 6: Create view for easier querying of current poll date votes
CREATE VIEW IF NOT EXISTS current_poll_date_votes AS
SELECT
  dv.*,
  ds.suggested_date,
  u.name as voter_name,
  u.email as voter_email
FROM date_votes dv
JOIN date_suggestions ds ON dv.date_suggestion_id = ds.id
JOIN users u ON dv.user_id = u.id
JOIN polls p ON dv.poll_id = p.id
WHERE p.status = 'active';
