UPDATE users SET is_admin = 1 WHERE email = 'playwright@localhost';
INSERT INTO polls (id, title, status, created_by, created_at)
VALUES (900003, 'E2E Admin Dinner Poll', 'active', (SELECT id FROM users WHERE email = 'playwright@localhost'), '9999-12-31 00:00:00');
INSERT INTO restaurant_votes (poll_id, restaurant_id, user_id)
VALUES (900003, 900001, (SELECT id FROM users WHERE email = 'playwright@localhost'));
INSERT INTO date_suggestions (id, poll_id, user_id, suggested_date)
VALUES (900003, 900003, (SELECT id FROM users WHERE email = 'playwright@localhost'), '2099-05-01');
INSERT INTO date_votes (poll_id, date_suggestion_id, user_id)
VALUES (900003, 900003, (SELECT id FROM users WHERE email = 'playwright@localhost'));
