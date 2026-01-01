-- Idempotent no-op (columns already exist in production)
SELECT 1;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
