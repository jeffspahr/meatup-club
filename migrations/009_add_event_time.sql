-- Add event_time column to events table
-- Default to 18:00 (6:00 PM) for existing events

ALTER TABLE events ADD COLUMN event_time TEXT DEFAULT '18:00';
