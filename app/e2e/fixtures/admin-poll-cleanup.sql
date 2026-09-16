DELETE FROM events WHERE id IN (SELECT created_event_id FROM polls WHERE id = 900003);
DELETE FROM polls WHERE id = 900003;
UPDATE users SET is_admin = 0 WHERE email = 'playwright@localhost';
