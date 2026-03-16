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

CREATE INDEX IF NOT EXISTS idx_rsvp_events_event_user_created_at
  ON rsvp_events(event_id, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_rsvp_events_user_created_at
  ON rsvp_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_rsvp_events_actor_user_id
  ON rsvp_events(actor_user_id);
