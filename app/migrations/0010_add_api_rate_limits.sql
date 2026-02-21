-- Basic per-identifier API request counters for short-window throttling
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

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expires_at
  ON api_rate_limits(expires_at);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_scope_identifier
  ON api_rate_limits(scope, identifier);
