-- Add requires_reauth flag to users table
ALTER TABLE users ADD COLUMN requires_reauth INTEGER DEFAULT 0;
