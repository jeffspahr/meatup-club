-- Preserve existing cookies as generation zero until an admin revokes them.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

-- Preserve revocations requested before this migration was deployed.
UPDATE users SET session_version = 1 WHERE requires_reauth = 1;
