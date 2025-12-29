-- Merge Duplicate Events Script
--
-- Problem: Events 2 and 3 are duplicates (same restaurant, date, time)
-- Calendar invites sent with UIDs: event-2@meatup.club and event-3@meatup.club
-- Solution:
--   1. Close the poll referencing event 3 (most recent)
--   2. Delete event 2 (older duplicate)
--   3. Users who received event-2 invite will get a "not found" initially,
--      but we'll send them a new invite to event 3

-- Step 1: Check current state
SELECT 'Current Events:' as step;
SELECT id, restaurant_name, event_date, event_time, status, created_at
FROM events
WHERE id IN (2, 3);

-- Step 2: Check poll status
SELECT 'Current Poll:' as step;
SELECT id, status, created_event_id, closed_at
FROM polls
WHERE id = 1;

-- Step 3: Close the poll and link it to event 3 (most recent)
UPDATE polls
SET status = 'closed',
    created_event_id = 3,
    closed_at = CURRENT_TIMESTAMP,
    winning_restaurant_id = (SELECT id FROM restaurants WHERE name = 'The Peddler Steak House' LIMIT 1),
    winning_date_id = (SELECT id FROM date_suggestions WHERE suggested_date = '2026-01-02' LIMIT 1)
WHERE id = 1;

-- Step 4: Delete event 2 (older duplicate)
-- Note: This will break calendar invite event-2@meatup.club
-- We'll need to resend invites to those users pointing to event 3
DELETE FROM events WHERE id = 2;

-- Step 5: Verify the changes
SELECT 'Updated Poll:' as step;
SELECT id, status, created_event_id, closed_at, winning_restaurant_id, winning_date_id
FROM polls
WHERE id = 1;

SELECT 'Remaining Event:' as step;
SELECT id, restaurant_name, event_date, event_time, status, created_at
FROM events
WHERE id = 3;
