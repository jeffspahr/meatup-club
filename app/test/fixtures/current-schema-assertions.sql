CREATE TABLE schema_verification (
  passed INTEGER NOT NULL CHECK (passed = 1)
);

INSERT INTO schema_verification (passed)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;

INSERT INTO schema_verification (passed)
SELECT CASE WHEN COUNT(*) = 7 THEN 1 ELSE 0 END
FROM sqlite_schema
WHERE type = 'table'
  AND name IN (
    'users',
    'events',
    'event_email_deliveries',
    'provider_webhooks',
    'sms_consent_events',
    'sms_deliveries',
    'sms_provider_health'
  );

INSERT INTO schema_verification (passed)
SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM pragma_table_info('events')
WHERE name = 'created_by';

INSERT INTO schema_verification (passed)
SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM pragma_table_info('users')
WHERE name = 'sms_opt_out_source';

INSERT INTO schema_verification (passed)
SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM pragma_table_info('sms_consent_events')
WHERE name = 'provider_message_sid';

INSERT INTO schema_verification (passed)
SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM pragma_index_list('sms_consent_events')
WHERE name = 'idx_sms_consent_events_provider_message_sid' AND "unique" = 1;

DROP TABLE schema_verification;
