-- Post-baseline schema cleanup
-- 1) Repoint polls.winning_restaurant_id FK to restaurants(id)
-- 2) Enforce one restaurant vote per user per poll
-- 3) Enforce unique phone_number values

PRAGMA foreign_keys = OFF;

-- Views depend on polls/restaurant_votes, so recreate them after table rewrites.
DROP VIEW IF EXISTS current_poll_restaurant_votes;
DROP VIEW IF EXISTS current_poll_date_votes;

-- Rebuild polls table with corrected restaurant FK target.
CREATE TABLE polls_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'closed')),
  start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_date DATETIME,
  winning_restaurant_id INTEGER,
  winning_date_id INTEGER,
  created_event_id INTEGER,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_by INTEGER,
  closed_at DATETIME,
  FOREIGN KEY (winning_restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL,
  FOREIGN KEY (winning_date_id) REFERENCES date_suggestions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

INSERT INTO polls_new (
  id, title, status, start_date, end_date,
  winning_restaurant_id, winning_date_id, created_event_id,
  created_by, created_at, closed_by, closed_at
)
SELECT
  id, title, status, start_date, end_date,
  winning_restaurant_id, winning_date_id, created_event_id,
  created_by, created_at, closed_by, closed_at
FROM polls;

DROP TABLE polls;
ALTER TABLE polls_new RENAME TO polls;

CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);

-- Rebuild restaurant_votes to enforce one vote per user per poll.
CREATE TABLE restaurant_votes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, user_id)
);

-- Keep only the most recent vote per (poll_id, user_id) if duplicates exist.
INSERT INTO restaurant_votes_new (id, poll_id, restaurant_id, user_id, created_at)
SELECT id, poll_id, restaurant_id, user_id, created_at
FROM (
  SELECT
    rv.*,
    ROW_NUMBER() OVER (PARTITION BY rv.poll_id, rv.user_id ORDER BY rv.id DESC) AS rn
  FROM restaurant_votes rv
)
WHERE rn = 1;

DROP TABLE restaurant_votes;
ALTER TABLE restaurant_votes_new RENAME TO restaurant_votes;

CREATE INDEX IF NOT EXISTS idx_restaurant_votes_poll ON restaurant_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_restaurant ON restaurant_votes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_user ON restaurant_votes(user_id);

-- Upgrade phone index from non-unique to unique.
DROP INDEX IF EXISTS idx_users_phone_number;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);

-- Recreate runtime views.
CREATE VIEW current_poll_restaurant_votes AS
SELECT
  rv.*, r.name as restaurant_name, u.name as voter_name, u.email as voter_email
FROM restaurant_votes rv
JOIN restaurants r ON rv.restaurant_id = r.id
JOIN users u ON rv.user_id = u.id
JOIN polls p ON rv.poll_id = p.id
WHERE p.status = 'active';

CREATE VIEW current_poll_date_votes AS
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

PRAGMA foreign_keys = ON;
