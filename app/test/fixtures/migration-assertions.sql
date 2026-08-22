CREATE TABLE migration_verification (
  passed INTEGER NOT NULL CHECK (passed = 1)
);

INSERT INTO migration_verification (passed)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;

INSERT INTO migration_verification (passed)
SELECT CASE WHEN created_by = 1 THEN 1 ELSE 0 END
FROM events
WHERE id = 1;

INSERT INTO migration_verification (passed)
SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM pragma_index_list('restaurant_votes')
WHERE origin = 'u' AND "unique" = 1;

INSERT INTO migration_verification (passed)
SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM pragma_index_list('users')
WHERE name = 'idx_users_phone_number' AND "unique" = 1;

INSERT INTO migration_verification (passed)
SELECT CASE WHEN COUNT(*) = 4 THEN 1 ELSE 0 END
FROM sqlite_schema
WHERE type = 'table'
  AND name IN (
    'event_email_deliveries',
    'provider_webhooks',
    'sms_deliveries',
    'sms_provider_health'
  );

INSERT INTO migration_verification (passed)
SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM pragma_table_info('users')
WHERE name = 'sms_opt_out_source';

INSERT INTO migration_verification (passed)
SELECT CASE WHEN COUNT(*) = 5 THEN 1 ELSE 0 END
FROM d1_migrations;

DROP TABLE migration_verification;
