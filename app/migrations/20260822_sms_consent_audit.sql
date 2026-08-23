CREATE TABLE IF NOT EXISTS sms_consent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('opt_in', 'opt_out')),
  source TEXT NOT NULL CHECK(source IN ('profile', 'sms')),
  disclosure_version TEXT NOT NULL,
  provider_message_sid TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sms_consent_events_user_id
  ON sms_consent_events(user_id);

CREATE INDEX IF NOT EXISTS idx_sms_consent_events_phone_number
  ON sms_consent_events(phone_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_consent_events_provider_message_sid
  ON sms_consent_events(provider_message_sid)
  WHERE provider_message_sid IS NOT NULL;
