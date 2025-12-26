-- Site content table for storing editable text content
CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_site_content_key ON site_content(key);

-- Insert default content
INSERT INTO site_content (key, title, content) VALUES
('description', 'Description', 'A group of bros dining quarterlyish at steakhouses in the Raleigh area.'),
('goals', 'Goals', '* Have intentional and fun bro time.
* Check out Raleigh area Steakhouses.
* Live, Laugh, Love.'),
('guidelines', 'Guidelines', '* We will typically lean towards family style dining options with the bill split evenly for simplicity. This could look like everyone ordering their preferred entree while splitting other menu items OR asking the server/chef to order for us where both entrees and sides are intended for sharing.
* We will split checks evenly by having everyone throwing a card in to keep things simple for us and the server. It''s challenging to be perfectly equitable in a group dining situation so we will lean towards simplicity.
* These are intended to be indulgent outings while trying not to be too over the top. I.e. we will probably order drinks (beer, wine, cocktails), but we will not do silly things like order $400 bottles of wine or $100 glasses of bourbon.
* We will try to get private rooms when available.'),
('membership', 'Membership', '* Invite only. This is intended to be the bros from the core friend group of the Raleigh Framily. We''re bad at intentionally hanging out outside of larger group events. This is an attempt to do that.
* All are welcome even if you don''t eat meat or specifically beef. Most places will have accommodations for this, and we''ll attempt to call out the events that have limited menu options. Feel free to bring it up ahead of time so we can make sure we appropriately accommodate.'),
('safety', 'Things to Consider', '* Meat Up Responsibly: Plan safe transportation to and from events—don''t drink and drive! Ride shares are probably cheaper than your entree or the cost of a couple of drinks. It''s worth it!');
