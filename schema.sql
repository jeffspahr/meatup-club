-- Meatup.Club Database Schema
-- SQLite schema for Cloudflare D1

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  phone_number TEXT,
  sms_opt_in INTEGER DEFAULT 0,
  sms_opt_out_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Events table (quarterly meetups)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_name TEXT,
  restaurant_address TEXT,
  event_date DATE,
  calendar_sequence INTEGER DEFAULT 0,
  status TEXT DEFAULT 'upcoming', -- upcoming, completed, cancelled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- RSVPs table
CREATE TABLE IF NOT EXISTS rsvps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT DEFAULT 'yes', -- yes, no, maybe
  dietary_restrictions TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(event_id, user_id)
);

-- SMS reminders
CREATE TABLE IF NOT EXISTS sms_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reminder_type TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(event_id, user_id, reminder_type)
);

-- Restaurant suggestions
CREATE TABLE IF NOT EXISTS restaurant_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event_id INTEGER, -- Which event this is suggested for (NULL = next event)
  name TEXT NOT NULL,
  address TEXT,
  cuisine TEXT,
  url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

-- Restaurant votes
CREATE TABLE IF NOT EXISTS restaurant_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (suggestion_id) REFERENCES restaurant_suggestions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(suggestion_id, user_id)
);

-- Date suggestions
CREATE TABLE IF NOT EXISTS date_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event_id INTEGER, -- Which event this is for (NULL = next event)
  suggested_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

-- Date votes
CREATE TABLE IF NOT EXISTS date_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_suggestion_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (date_suggestion_id) REFERENCES date_suggestions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(date_suggestion_id, user_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user_id ON rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_event_user ON sms_reminders(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_suggestions_event_id ON restaurant_suggestions(event_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_suggestion_id ON restaurant_votes(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_date_suggestions_event_id ON date_suggestions(event_id);
CREATE INDEX IF NOT EXISTS idx_date_votes_suggestion_id ON date_votes(date_suggestion_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
