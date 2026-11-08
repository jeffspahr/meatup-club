DELETE FROM users WHERE id IN (910001, 910002);
UPDATE users SET picture = NULL WHERE email = 'playwright@localhost';
