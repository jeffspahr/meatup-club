-- Track admin RSVP overrides
ALTER TABLE rsvps ADD COLUMN admin_override INTEGER DEFAULT 0;
ALTER TABLE rsvps ADD COLUMN admin_override_by INTEGER;
ALTER TABLE rsvps ADD COLUMN admin_override_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_rsvps_admin_override ON rsvps(admin_override);
