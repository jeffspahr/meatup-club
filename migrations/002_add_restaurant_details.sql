-- Add rich restaurant data fields
ALTER TABLE restaurant_suggestions ADD COLUMN google_place_id TEXT;
ALTER TABLE restaurant_suggestions ADD COLUMN google_rating REAL;
ALTER TABLE restaurant_suggestions ADD COLUMN rating_count INTEGER;
ALTER TABLE restaurant_suggestions ADD COLUMN price_level INTEGER; -- 1-4 for $ to $$$$
ALTER TABLE restaurant_suggestions ADD COLUMN phone_number TEXT;
ALTER TABLE restaurant_suggestions ADD COLUMN reservation_url TEXT;
ALTER TABLE restaurant_suggestions ADD COLUMN menu_url TEXT;
ALTER TABLE restaurant_suggestions ADD COLUMN photo_url TEXT;
ALTER TABLE restaurant_suggestions ADD COLUMN google_maps_url TEXT;

-- Create index for place ID lookups
CREATE INDEX IF NOT EXISTS idx_restaurant_suggestions_place_id ON restaurant_suggestions(google_place_id);
