/**
 * Server-side utilities for restaurant operations
 *
 * Architecture: Restaurants are global and available in all polls.
 * Users can vote on any restaurant in any poll (unless explicitly excluded).
 */

export interface Restaurant {
  id: number;
  name: string;
  address: string | null;
  google_place_id: string | null;
  google_rating: number | null;
  rating_count: number | null;
  price_level: number | null;
  cuisine: string | null;
  phone_number: string | null;
  reservation_url: string | null;
  menu_url: string | null;
  photo_url: string | null;
  google_maps_url: string | null;
  opening_hours: string | null;
  created_at: string;
  created_by: number | null;
}

export interface RestaurantWithVotes extends Restaurant {
  vote_count: number;
  user_has_voted: boolean;
}

/**
 * Get all restaurants available for voting in a poll
 * Excludes any restaurants that have been hidden from the poll
 */
export async function getRestaurantsForPoll(
  db: any,
  pollId: number,
  userId?: number
): Promise<RestaurantWithVotes[]> {
  const userVoteSubquery = userId
    ? `(SELECT COUNT(*) FROM restaurant_votes WHERE restaurant_id = r.id AND poll_id = ? AND user_id = ?) as user_has_voted`
    : '0 as user_has_voted';

  const params = userId ? [pollId, pollId, userId, pollId] : [pollId, pollId];

  const restaurants = await db
    .prepare(`
      SELECT
        r.*,
        (SELECT COUNT(*) FROM restaurant_votes WHERE restaurant_id = r.id AND poll_id = ?) as vote_count,
        ${userVoteSubquery}
      FROM restaurants r
      LEFT JOIN poll_excluded_restaurants per ON per.restaurant_id = r.id AND per.poll_id = ?
      WHERE per.id IS NULL
      ORDER BY vote_count DESC, r.name
    `)
    .bind(...params)
    .all();

  return restaurants.results || [];
}

/**
 * Find a restaurant by Google Place ID
 */
export async function findRestaurantByPlaceId(
  db: any,
  placeId: string
): Promise<Restaurant | null> {
  return await db
    .prepare('SELECT * FROM restaurants WHERE google_place_id = ?')
    .bind(placeId)
    .first();
}

/**
 * Find a restaurant by name (case-insensitive)
 */
export async function findRestaurantByName(
  db: any,
  name: string
): Promise<Restaurant | null> {
  return await db
    .prepare('SELECT * FROM restaurants WHERE LOWER(name) = LOWER(?)')
    .bind(name)
    .first();
}

/**
 * Create a new restaurant
 */
export async function createRestaurant(
  db: any,
  restaurant: {
    name: string;
    address?: string;
    google_place_id?: string;
    google_rating?: number;
    rating_count?: number;
    price_level?: number;
    cuisine?: string;
    phone_number?: string;
    reservation_url?: string;
    menu_url?: string;
    photo_url?: string;
    google_maps_url?: string;
    opening_hours?: string;
    created_by: number;
  }
): Promise<number> {
  const result = await db
    .prepare(`
      INSERT INTO restaurants (
        name, address, google_place_id, google_rating, rating_count,
        price_level, cuisine, phone_number, reservation_url, menu_url,
        photo_url, google_maps_url, opening_hours, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      restaurant.name,
      restaurant.address || null,
      restaurant.google_place_id || null,
      restaurant.google_rating || null,
      restaurant.rating_count || null,
      restaurant.price_level || null,
      restaurant.cuisine || null,
      restaurant.phone_number || null,
      restaurant.reservation_url || null,
      restaurant.menu_url || null,
      restaurant.photo_url || null,
      restaurant.google_maps_url || null,
      restaurant.opening_hours || null,
      restaurant.created_by
    )
    .run();

  return result.meta.last_row_id;
}

/**
 * Vote for a restaurant in a poll
 * Replaces any existing vote by this user in this poll
 */
export async function voteForRestaurant(
  db: any,
  pollId: number,
  restaurantId: number,
  userId: number
): Promise<void> {
  // Delete any existing vote by this user in this poll
  await db
    .prepare('DELETE FROM restaurant_votes WHERE poll_id = ? AND user_id = ?')
    .bind(pollId, userId)
    .run();

  // Insert new vote
  await db
    .prepare(
      'INSERT INTO restaurant_votes (poll_id, restaurant_id, user_id) VALUES (?, ?, ?)'
    )
    .bind(pollId, restaurantId, userId)
    .run();
}

/**
 * Remove a user's vote from a poll
 */
export async function removeVote(
  db: any,
  pollId: number,
  userId: number
): Promise<void> {
  await db
    .prepare('DELETE FROM restaurant_votes WHERE poll_id = ? AND user_id = ?')
    .bind(pollId, userId)
    .run();
}

/**
 * Get a user's current vote in a poll
 */
export async function getUserVote(
  db: any,
  pollId: number,
  userId: number
): Promise<{ restaurant_id: number } | null> {
  return await db
    .prepare(
      'SELECT restaurant_id FROM restaurant_votes WHERE poll_id = ? AND user_id = ?'
    )
    .bind(pollId, userId)
    .first();
}

/**
 * Delete a restaurant (admin only)
 * This will cascade delete all votes for this restaurant
 */
export async function deleteRestaurant(
  db: any,
  restaurantId: number
): Promise<void> {
  await db
    .prepare('DELETE FROM restaurants WHERE id = ?')
    .bind(restaurantId)
    .run();
}
