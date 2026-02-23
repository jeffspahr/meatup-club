-- Meatup.Club canonical schema (fresh install)
-- Apply this file to initialize a new D1 database.
-- Historical migrations in /migrations and /app/migrations are for upgrades of older installs.

PRAGMA foreign_keys = ON;

-- Users ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'invited', 'active', 'inactive')),
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0, 1)),
  requires_reauth INTEGER NOT NULL DEFAULT 0 CHECK(requires_reauth IN (0, 1)),
  notify_comment_replies INTEGER NOT NULL DEFAULT 1 CHECK(notify_comment_replies IN (0, 1)),
  notify_poll_updates INTEGER NOT NULL DEFAULT 1 CHECK(notify_poll_updates IN (0, 1)),
  notify_event_updates INTEGER NOT NULL DEFAULT 1 CHECK(notify_event_updates IN (0, 1)),
  phone_number TEXT UNIQUE,
  sms_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(sms_opt_in IN (0, 1)),
  sms_opt_out_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Events ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_name TEXT NOT NULL,
  restaurant_address TEXT,
  event_date DATE NOT NULL,
  event_time TEXT NOT NULL DEFAULT '18:00',
  calendar_sequence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'completed', 'cancelled')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Restaurants ----------------------------------------------------------------
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

-- Polls ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
  start_date DATETIME,
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

CREATE TABLE IF NOT EXISTS poll_excluded_restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  excluded_by INTEGER REFERENCES users(id),
  excluded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  UNIQUE(poll_id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS restaurant_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS date_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  suggested_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, suggested_date)
);

CREATE TABLE IF NOT EXISTS date_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  date_suggestion_id INTEGER NOT NULL REFERENCES date_suggestions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, date_suggestion_id, user_id)
);

-- RSVP + reminders -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rsvps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'yes' CHECK(status IN ('yes', 'no', 'maybe')),
  comments TEXT,
  dietary_restrictions TEXT,
  admin_override INTEGER NOT NULL DEFAULT 0 CHECK(admin_override IN (0, 1)),
  admin_override_by INTEGER,
  admin_override_at DATETIME,
  updated_via_calendar INTEGER NOT NULL DEFAULT 0 CHECK(updated_via_calendar IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_override_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(event_id, user_id)
);

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

-- Comments + activity --------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  commentable_type TEXT NOT NULL,
  commentable_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  parent_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  action_details TEXT,
  route TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Config/content -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Integrations/rate limits ---------------------------------------------------
CREATE TABLE IF NOT EXISTS event_aliases (
  alias_event_id INTEGER PRIMARY KEY,
  canonical_event_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (canonical_event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  identifier TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scope, identifier, window_start)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, delivery_id)
);

-- Indexes --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);
CREATE INDEX IF NOT EXISTS idx_polls_created_at ON polls(created_at);

CREATE INDEX IF NOT EXISTS idx_restaurants_place_id ON restaurants(google_place_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_name ON restaurants(name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_poll_excluded_restaurants_poll ON poll_excluded_restaurants(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_excluded_restaurants_restaurant ON poll_excluded_restaurants(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_votes_poll ON restaurant_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_restaurant ON restaurant_votes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_user ON restaurant_votes(user_id);

CREATE INDEX IF NOT EXISTS idx_date_suggestions_poll ON date_suggestions(poll_id);
CREATE INDEX IF NOT EXISTS idx_date_suggestions_date ON date_suggestions(suggested_date);

CREATE INDEX IF NOT EXISTS idx_date_votes_poll ON date_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_date_votes_suggestion ON date_votes(date_suggestion_id);
CREATE INDEX IF NOT EXISTS idx_date_votes_user ON date_votes(user_id);

CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user_id ON rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_admin_override ON rsvps(admin_override);

CREATE INDEX IF NOT EXISTS idx_sms_reminders_event_user ON sms_reminders(event_id, user_id);

CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_commentable ON comments(commentable_type, commentable_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_action_type ON activity_log(action_type);

CREATE INDEX IF NOT EXISTS idx_site_content_key ON site_content(key);
CREATE INDEX IF NOT EXISTS idx_event_aliases_canonical_event_id ON event_aliases(canonical_event_id);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expires_at ON api_rate_limits(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_scope_identifier ON api_rate_limits(scope, identifier);

-- Seed content ---------------------------------------------------------------
INSERT OR IGNORE INTO site_content (key, title, content) VALUES
('description', 'Description', 'Meatup.Club is a private quarterly dining group focused on great steakhouses and easy planning.'),
('goals', 'Goals', '* Spend intentional time together\n* Explore excellent steakhouse spots\n* Keep planning lightweight and consistent'),
('guidelines', 'Guidelines', '* Vote on dates and restaurants each quarter\n* Keep costs transparent and split simply\n* Prioritize safe transportation'),
('membership', 'Membership', '* Invite-only membership\n* Active members can vote and RSVP\n* Admins manage invitations and events'),
('safety', 'Things to Consider', '* Plan transportation in advance\n* Never drink and drive\n* Communicate dietary constraints early');

INSERT OR IGNORE INTO email_templates (id, name, subject, html_body, text_body, is_default)
VALUES (
  1,
  'Default Invitation',
  'You are invited to Meatup.Club',
  '<p>Hey {{inviteeName}},</p><p>{{inviterName}} invited you to join Meatup.Club.</p><p><a href="{{acceptLink}}">Accept invitation</a></p>',
  'Hey {{inviteeName}}, {{inviterName}} invited you to join Meatup.Club. Accept: {{acceptLink}}',
  1
);
