PRAGMA foreign_keys = ON;

DELETE FROM polls WHERE id = -900001;
DELETE FROM restaurants WHERE id IN (-900001, -900002);
DELETE FROM activity_log
WHERE user_id IN (SELECT id FROM users WHERE email = 'playwright@localhost');
DELETE FROM users WHERE email = 'playwright@localhost';

INSERT INTO users (
  email,
  name,
  is_admin,
  status,
  requires_reauth
) VALUES (
  'playwright@localhost',
  'Playwright Member',
  0,
  'active',
  0
);

INSERT INTO restaurants (id, name, address, google_place_id, created_by)
VALUES
  (
    -900001,
    'E2E Chophouse',
    '1 Browser Way',
    'e2e_chophouse',
    (SELECT id FROM users WHERE email = 'playwright@localhost')
  ),
  (
    -900002,
    'E2E Steakhouse',
    '2 Browser Way',
    'e2e_steakhouse',
    (SELECT id FROM users WHERE email = 'playwright@localhost')
  );

INSERT INTO polls (id, title, status, created_by, created_at)
VALUES (
  -900001,
  'Playwright Dinner Poll',
  'active',
  (SELECT id FROM users WHERE email = 'playwright@localhost'),
  '9999-01-01 00:00:00'
);
