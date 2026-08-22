PRAGMA foreign_keys = ON;

DELETE FROM rsvps WHERE event_id IN (-900001, -900002);
DELETE FROM events WHERE id IN (-900001, -900002);
DELETE FROM polls WHERE id = -900001;
DELETE FROM restaurants WHERE id IN (900001, 900002);
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
    900001,
    'E2E Chophouse',
    '1 Browser Way',
    'e2e_chophouse',
    (SELECT id FROM users WHERE email = 'playwright@localhost')
  ),
  (
    900002,
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

INSERT INTO events (
  id,
  restaurant_name,
  restaurant_address,
  event_date,
  event_time,
  status
) VALUES
  (
    -900001,
    'E2E Supper Club',
    '3 Browser Way',
    '9999-03-01',
    '18:30',
    'upcoming'
  ),
  (
    -900002,
    'E2E Grill',
    '4 Browser Way',
    '9999-03-02',
    '18:30',
    'upcoming'
  );

INSERT INTO rsvps (event_id, user_id, status)
VALUES (
  -900001,
  (SELECT id FROM users WHERE email = 'playwright@localhost'),
  'yes'
);
