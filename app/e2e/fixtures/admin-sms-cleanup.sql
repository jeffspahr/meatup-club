DELETE FROM users WHERE email = 'sms-preview@localhost';
UPDATE users SET sms_opt_in = 0, phone_number = NULL WHERE email = 'playwright@localhost';
