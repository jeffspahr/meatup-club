CREATE TABLE IF NOT EXISTS poll_sms_deliveries (
  id TEXT PRIMARY KEY,
  poll_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  message_type TEXT NOT NULL,
  provider_message_sid TEXT UNIQUE,
  status TEXT NOT NULL,
  status_rank INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_poll_sms_deliveries_poll_created
  ON poll_sms_deliveries(poll_id, created_at);
CREATE INDEX IF NOT EXISTS idx_poll_sms_deliveries_user_created
  ON poll_sms_deliveries(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_sms_deliveries_provider_sid
  ON poll_sms_deliveries(provider_message_sid);
