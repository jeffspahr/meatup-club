-- Add calendar sequence to events for invite updates
ALTER TABLE events ADD COLUMN calendar_sequence INTEGER DEFAULT 0;
