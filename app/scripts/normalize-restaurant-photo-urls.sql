-- Normalize restaurant photo URLs to use the app proxy endpoint.
-- Usage:
--   cd app
--   npx wrangler d1 execute meatup-club-db --remote --file=./scripts/normalize-restaurant-photo-urls.sql

UPDATE restaurants
SET photo_url = (
  CASE
    WHEN instr(
      'https://meatup.club/api/places/photo?' ||
      replace(
        replace(photo_url, 'https://places.googleapis.com/v1/', 'name='),
        '/media?',
        '&'
      ),
      '&key='
    ) > 0 THEN
      substr(
        'https://meatup.club/api/places/photo?' ||
        replace(
          replace(photo_url, 'https://places.googleapis.com/v1/', 'name='),
          '/media?',
          '&'
        ),
        1,
        instr(
          'https://meatup.club/api/places/photo?' ||
          replace(
            replace(photo_url, 'https://places.googleapis.com/v1/', 'name='),
            '/media?',
            '&'
          ),
          '&key='
        ) - 1
      )
    ELSE
      'https://meatup.club/api/places/photo?' ||
      replace(
        replace(photo_url, 'https://places.googleapis.com/v1/', 'name='),
        '/media?',
        '&'
      )
  END
)
WHERE photo_url LIKE 'https://places.googleapis.com/v1/%/media?%';
