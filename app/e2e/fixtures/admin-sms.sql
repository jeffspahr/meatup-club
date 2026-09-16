UPDATE users
SET sms_opt_in = 1, sms_opt_out_at = NULL, phone_number = '+12025550101'
WHERE email = 'playwright@localhost';
INSERT INTO users (email, name, status, sms_opt_in, phone_number)
VALUES ('sms-preview@localhost', 'Pending RSVP Member', 'active', 1, '+12025550102');
