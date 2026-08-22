CREATE TABLE IF NOT EXISTS sms_provider_health (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  error_code TEXT,
  checked_at DATETIME NOT NULL,
  last_healthy_at DATETIME,
  CHECK (provider = 'twilio'),
  CHECK (status IN (
    'healthy',
    'misconfigured',
    'authentication_failed',
    'account_suspended',
    'account_closed',
    'provider_error'
  ))
);
