PRAGMA foreign_keys = ON;

DELETE FROM rsvps WHERE event_id IN (-900001, -900002);
DELETE FROM events WHERE id IN (-900001, -900002);
DELETE FROM polls WHERE id = -900001;
DELETE FROM restaurants WHERE id IN (-900001, -900002);
DELETE FROM activity_log
WHERE user_id IN (SELECT id FROM users WHERE email = 'playwright@localhost');
DELETE FROM users WHERE email = 'playwright@localhost';
