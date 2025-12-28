-- Migration: Refactor restaurants to be global (available in all polls)
-- Restaurants exist independently and can be voted on in any poll
-- Optional exclusions can hide specific restaurants from specific polls

-- Step 1: Create global restaurants table
CREATE TABLE restaurants (
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

-- Step 2: Migrate unique restaurants from restaurant_suggestions
-- Deduplicate by name (case-insensitive) and keep most complete record
INSERT INTO restaurants (
  name, address, google_place_id, google_rating, rating_count,
  price_level, cuisine, phone_number, reservation_url, menu_url,
  photo_url, google_maps_url, opening_hours, created_by, created_at
)
SELECT
  name,
  MAX(address) as address,
  MAX(google_place_id) as google_place_id,
  MAX(google_rating) as google_rating,
  MAX(rating_count) as rating_count,
  MAX(price_level) as price_level,
  MAX(cuisine) as cuisine,
  MAX(phone_number) as phone_number,
  MAX(reservation_url) as reservation_url,
  MAX(menu_url) as menu_url,
  MAX(photo_url) as photo_url,
  MAX(google_maps_url) as google_maps_url,
  MAX(opening_hours) as opening_hours,
  MIN(user_id) as created_by,
  MIN(created_at) as created_at
FROM restaurant_suggestions
GROUP BY LOWER(name);

-- Step 3: Create new restaurant_votes table (poll_id + restaurant_id + user_id)
CREATE TABLE restaurant_votes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, restaurant_id, user_id)
);

-- Step 4: Migrate existing votes to new structure
INSERT INTO restaurant_votes_new (poll_id, restaurant_id, user_id, created_at)
SELECT
  COALESCE(rs.poll_id, 1) as poll_id,  -- Default to poll 1 for old votes
  r.id as restaurant_id,
  rv.user_id,
  rv.created_at
FROM restaurant_votes rv
JOIN restaurant_suggestions rs ON rv.suggestion_id = rs.id
JOIN restaurants r ON LOWER(rs.name) = LOWER(r.name);

-- Step 5: Create poll_excluded_restaurants table (for future use)
CREATE TABLE poll_excluded_restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  excluded_by INTEGER REFERENCES users(id),
  excluded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  UNIQUE(poll_id, restaurant_id)
);

-- Step 6: Drop old tables
DROP TABLE restaurant_votes;
DROP TABLE restaurant_suggestions;

-- Step 7: Rename new votes table
ALTER TABLE restaurant_votes_new RENAME TO restaurant_votes;

-- Step 8: Create indexes for performance
CREATE INDEX idx_restaurant_votes_poll ON restaurant_votes(poll_id);
CREATE INDEX idx_restaurant_votes_restaurant ON restaurant_votes(restaurant_id);
CREATE INDEX idx_restaurant_votes_user ON restaurant_votes(user_id);
CREATE INDEX idx_restaurants_place_id ON restaurants(google_place_id);
CREATE INDEX idx_restaurants_name ON restaurants(name COLLATE NOCASE);
CREATE INDEX idx_poll_excluded_restaurants_poll ON poll_excluded_restaurants(poll_id);
CREATE INDEX idx_poll_excluded_restaurants_restaurant ON poll_excluded_restaurants(restaurant_id);
