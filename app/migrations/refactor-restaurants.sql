-- Migration: Refactor restaurants to be global (available in all polls)
-- Idempotent version: ensures new schema exists without re-migrating data

-- Drop view if present so it can be recreated safely
DROP VIEW IF EXISTS current_poll_restaurant_votes;

-- Ensure global restaurants table exists
CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  google_place_id TEXT UNIQUE,
  google_rating REAL,
  rating_count INTEGER,
  price_level INTEGER,
  cuisine TEXT,
  phone_number TEXT,
  reservation_url TEXT,
  menu_url TEXT,
  photo_url TEXT,
  google_maps_url TEXT,
  opening_hours TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

-- Ensure restaurant votes table uses poll_id + restaurant_id + user_id
CREATE TABLE IF NOT EXISTS restaurant_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, restaurant_id, user_id)
);

-- Ensure poll exclusions table exists
CREATE TABLE IF NOT EXISTS poll_excluded_restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  excluded_by INTEGER REFERENCES users(id),
  excluded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  UNIQUE(poll_id, restaurant_id)
);

-- Indexes for performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_poll ON restaurant_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_restaurant ON restaurant_votes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_user ON restaurant_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_place_id ON restaurants(google_place_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_name ON restaurants(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_poll_excluded_restaurants_poll ON poll_excluded_restaurants(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_excluded_restaurants_restaurant ON poll_excluded_restaurants(restaurant_id);

-- Recreate view with new schema
CREATE VIEW current_poll_restaurant_votes AS
SELECT
  rv.*, r.name as restaurant_name, u.name as voter_name, u.email as voter_email
FROM restaurant_votes rv
JOIN restaurants r ON rv.restaurant_id = r.id
JOIN users u ON rv.user_id = u.id
JOIN polls p ON rv.poll_id = p.id
WHERE p.status = 'active';
