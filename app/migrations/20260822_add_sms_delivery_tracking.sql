ALTER TABLE users ADD COLUMN sms_opt_out_source TEXT;

CREATE TABLE IF NOT EXISTS sms_deliveries (
  id TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reminder_type TEXT NOT NULL,
  provider_message_sid TEXT UNIQUE,
  status TEXT NOT NULL,
  status_rank INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sms_deliveries_event_created
  ON sms_deliveries(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_deliveries_user_created
  ON sms_deliveries(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_deliveries_provider_sid
  ON sms_deliveries(provider_message_sid);
