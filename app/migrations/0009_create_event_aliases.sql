-- Map deprecated/duplicate event IDs to canonical event IDs for webhook reconciliation
CREATE TABLE IF NOT EXISTS event_aliases (
  alias_event_id INTEGER PRIMARY KEY,
  canonical_event_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (canonical_event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_aliases_canonical_event_id
  ON event_aliases(canonical_event_id);
