-- Minimal production-shaped schema used to prove the post-baseline migration chain.
-- Keep this fixture immutable except when repairing historical migration coverage.

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone_number TEXT
);

CREATE INDEX idx_users_phone_number ON users(phone_number);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_name TEXT,
  event_date DATE,
  status TEXT DEFAULT 'upcoming'
);

CREATE TABLE restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE polls (
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
  FOREIGN KEY (created_event_id) REFERENCES events(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

CREATE TABLE restaurant_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, restaurant_id, user_id)
);

CREATE TABLE date_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  suggested_date DATE NOT NULL
);

CREATE TABLE date_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  date_suggestion_id INTEGER NOT NULL REFERENCES date_suggestions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE VIEW current_poll_restaurant_votes AS
SELECT rv.*, r.name AS restaurant_name, u.name AS voter_name, u.email AS voter_email
FROM restaurant_votes rv
JOIN restaurants r ON rv.restaurant_id = r.id
JOIN users u ON rv.user_id = u.id
JOIN polls p ON rv.poll_id = p.id
WHERE p.status = 'active';

CREATE VIEW current_poll_date_votes AS
SELECT dv.*, ds.suggested_date, u.name AS voter_name, u.email AS voter_email
FROM date_votes dv
JOIN date_suggestions ds ON dv.date_suggestion_id = ds.id
JOIN users u ON dv.user_id = u.id
JOIN polls p ON dv.poll_id = p.id
WHERE p.status = 'active';

INSERT INTO users (id, email, name, phone_number)
VALUES (1, 'owner@example.com', 'Owner', '+15555550100');

INSERT INTO events (id, restaurant_name, event_date, status)
VALUES (1, 'Legacy Prime', '2026-04-18', 'upcoming');

INSERT INTO restaurants (id, name)
VALUES (1, 'First Choice');

INSERT INTO polls (
  id, title, status, created_event_id, created_by, closed_by, closed_at
) VALUES (
  1, 'Legacy Poll', 'closed', 1, 1, 1, CURRENT_TIMESTAMP
);
