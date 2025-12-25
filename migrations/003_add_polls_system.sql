-- Create polls table for managing voting periods
CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'closed')),
  start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_date DATETIME,
  winning_restaurant_id INTEGER,
  winning_date_id INTEGER,
  created_event_id INTEGER,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_by INTEGER,
  closed_at DATETIME,
  FOREIGN KEY (winning_restaurant_id) REFERENCES restaurant_suggestions(id) ON DELETE SET NULL,
  FOREIGN KEY (winning_date_id) REFERENCES date_suggestions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

-- Add poll_id to restaurant_suggestions
ALTER TABLE restaurant_suggestions ADD COLUMN poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE;

-- Add poll_id to date_suggestions  
ALTER TABLE date_suggestions ADD COLUMN poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);
CREATE INDEX IF NOT EXISTS idx_restaurant_suggestions_poll_id ON restaurant_suggestions(poll_id);
CREATE INDEX IF NOT EXISTS idx_date_suggestions_poll_id ON date_suggestions(poll_id);

-- Create a default active poll for existing data (optional - can be skipped if no data exists)
-- INSERT INTO polls (title, status, created_by) 
-- SELECT 'Initial Poll', 'active', MIN(id) FROM users WHERE is_admin = 1;

-- Link existing suggestions to the default poll (optional)
-- UPDATE restaurant_suggestions SET poll_id = (SELECT id FROM polls ORDER BY id LIMIT 1) WHERE poll_id IS NULL;
-- UPDATE date_suggestions SET poll_id = (SELECT id FROM polls ORDER BY id LIMIT 1) WHERE poll_id IS NULL;
