-- Migration 006: Decouple restaurants from polls
-- This allows restaurants to exist independently and be voted on across multiple polls

-- Step 1: Create new restaurant_votes table with poll_id
-- We need to recreate the table because SQLite doesn't support dropping constraints
CREATE TABLE restaurant_votes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  suggestion_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (suggestion_id) REFERENCES restaurant_suggestions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  -- New constraint: one vote per user per poll (not per restaurant)
  UNIQUE(poll_id, user_id)
);

-- Step 2: Migrate existing votes
-- For each existing vote, we need to figure out which poll it belongs to
-- We'll use the poll_id from the restaurant_suggestion
INSERT INTO restaurant_votes_new (id, poll_id, suggestion_id, user_id, created_at)
SELECT
  rv.id,
  COALESCE(rs.poll_id, (SELECT id FROM polls ORDER BY id DESC LIMIT 1)) as poll_id,
  rv.suggestion_id,
  rv.user_id,
  rv.created_at
FROM restaurant_votes rv
LEFT JOIN restaurant_suggestions rs ON rv.suggestion_id = rs.id
WHERE rv.id IN (
  -- Only keep the most recent vote per user per poll
  SELECT MAX(rv2.id)
  FROM restaurant_votes rv2
  LEFT JOIN restaurant_suggestions rs2 ON rv2.suggestion_id = rs2.id
  GROUP BY rv2.user_id, rs2.poll_id
);

-- Step 3: Drop old table and rename new one
DROP TABLE restaurant_votes;
ALTER TABLE restaurant_votes_new RENAME TO restaurant_votes;

-- Step 4: Recreate index
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_suggestion_id ON restaurant_votes(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_poll_id ON restaurant_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_user_id ON restaurant_votes(user_id);

-- Step 5: Make poll_id nullable on restaurant_suggestions
-- (It's already nullable from migration 003, so this is just a comment for clarity)
-- Restaurants can now exist without being tied to a specific poll

-- Step 6: Create view for easier querying of current poll votes
CREATE VIEW IF NOT EXISTS current_poll_restaurant_votes AS
SELECT
  rv.*,
  rs.name as restaurant_name,
  u.name as voter_name,
  u.email as voter_email
FROM restaurant_votes rv
JOIN restaurant_suggestions rs ON rv.suggestion_id = rs.id
JOIN users u ON rv.user_id = u.id
JOIN polls p ON rv.poll_id = p.id
WHERE p.status = 'active';
