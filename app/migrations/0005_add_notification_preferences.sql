-- Add notification preferences to users table
ALTER TABLE users ADD COLUMN notify_comment_replies INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_poll_updates INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_event_updates INTEGER DEFAULT 1;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
