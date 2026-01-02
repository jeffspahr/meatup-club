-- Add SMS fields to users
ALTER TABLE users ADD COLUMN phone_number TEXT;
ALTER TABLE users ADD COLUMN sms_opt_in INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN sms_opt_out_at DATETIME;

-- Track SMS reminders to prevent duplicates
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

CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_event_user ON sms_reminders(event_id, user_id);
