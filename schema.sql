-- Meatup.Club canonical schema (fresh install)
-- Snapshot aligned to production D1 schema on 2026-02-23.
-- Internal D1 tables (_cf_KV, d1_migrations) are intentionally excluded.

PRAGMA foreign_keys = ON;

-- Users ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_admin BOOLEAN DEFAULT 0,
  status TEXT DEFAULT 'active',
  requires_reauth INTEGER DEFAULT 0,
  notify_comment_replies INTEGER DEFAULT 1,
  notify_poll_updates INTEGER DEFAULT 1,
  notify_event_updates INTEGER DEFAULT 1,
  phone_number TEXT,
  sms_opt_in INTEGER DEFAULT 0,
  sms_opt_out_at DATETIME
);

-- Events ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_name TEXT,
  restaurant_address TEXT,
  event_date DATE,
  status TEXT DEFAULT 'upcoming',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  event_time TEXT DEFAULT '18:00',
  calendar_sequence INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id)
);

-- Polls ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS polls (
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
  user_id INTEGER NOT NULL,
  event_id INTEGER,
  suggested_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS date_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  date_suggestion_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (date_suggestion_id) REFERENCES date_suggestions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(poll_id, date_suggestion_id, user_id)
);

-- RSVP + reminders -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rsvps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT DEFAULT 'yes',
  comments TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_via_calendar INTEGER DEFAULT 0,
  admin_override INTEGER DEFAULT 0,
  admin_override_by INTEGER,
  admin_override_at DATETIME,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS rsvp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  actor_user_id INTEGER,
  source TEXT NOT NULL CHECK(source IN ('website', 'calendar_email', 'sms', 'admin_override', 'poll_default')),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  previous_comments TEXT,
  new_comments TEXT,
  previous_admin_override INTEGER NOT NULL DEFAULT 0,
  new_admin_override INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  parent_id INTEGER DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
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

CREATE TABLE IF NOT EXISTS event_email_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  batch_id TEXT NOT NULL,
  delivery_type TEXT NOT NULL CHECK(delivery_type IN ('invite', 'update', 'cancel')),
  recipient_email TEXT NOT NULL,
  rsvp_status TEXT,
  restaurant_name TEXT NOT NULL,
  restaurant_address TEXT,
  event_date DATE NOT NULL,
  event_time TEXT NOT NULL,
  calendar_sequence INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'sending',
      'provider_accepted',
      'delivered',
      'delivery_delayed',
      'retry',
      'failed',
      'bounced',
      'complained'
    )),
  provider_message_id TEXT UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_provider_event TEXT,
  last_queued_at DATETIME,
  next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sending_started_at DATETIME,
  provider_accepted_at DATETIME,
  delivered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provider_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  purpose TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  events_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, purpose),
  UNIQUE(provider, webhook_id)
);

-- Views ----------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS current_poll_restaurant_votes AS
SELECT
  rv.*,
  r.name as restaurant_name,
  u.name as voter_name,
  u.email as voter_email
FROM restaurant_votes rv
JOIN restaurants r ON rv.restaurant_id = r.id
JOIN users u ON rv.user_id = u.id
JOIN polls p ON rv.poll_id = p.id
WHERE p.status = 'active';

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

-- Indexes --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);

CREATE INDEX IF NOT EXISTS idx_restaurants_place_id ON restaurants(google_place_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_name ON restaurants(name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_poll_excluded_restaurants_poll ON poll_excluded_restaurants(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_excluded_restaurants_restaurant ON poll_excluded_restaurants(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_votes_poll ON restaurant_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_restaurant ON restaurant_votes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_votes_user ON restaurant_votes(user_id);

CREATE INDEX IF NOT EXISTS idx_date_suggestions_event_id ON date_suggestions(event_id);
CREATE INDEX IF NOT EXISTS idx_date_suggestions_poll_id ON date_suggestions(poll_id);

CREATE INDEX IF NOT EXISTS idx_date_votes_poll_id ON date_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_date_votes_suggestion_id ON date_votes(date_suggestion_id);
CREATE INDEX IF NOT EXISTS idx_date_votes_user_id ON date_votes(user_id);

CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user_id ON rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_admin_override ON rsvps(admin_override);
CREATE INDEX IF NOT EXISTS idx_rsvp_events_event_user_created_at ON rsvp_events(event_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rsvp_events_user_created_at ON rsvp_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rsvp_events_actor_user_id ON rsvp_events(actor_user_id);

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

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_provider ON webhook_deliveries(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_received_at ON webhook_deliveries(received_at);
CREATE INDEX IF NOT EXISTS idx_event_email_deliveries_batch ON event_email_deliveries(batch_id);
CREATE INDEX IF NOT EXISTS idx_event_email_deliveries_event ON event_email_deliveries(event_id, delivery_type, calendar_sequence);
CREATE INDEX IF NOT EXISTS idx_event_email_deliveries_backlog ON event_email_deliveries(status, next_attempt_at, last_queued_at);
CREATE INDEX IF NOT EXISTS idx_provider_webhooks_provider ON provider_webhooks(provider, purpose);

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
