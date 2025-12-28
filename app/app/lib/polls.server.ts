/**
 * Server-side utilities for poll and vote leader data
 */

interface VoteLeader {
  id: number;
  name: string;
  address: string | null;
  vote_count: number;
}

interface DateLeader {
  id: number;
  suggested_date: string;
  vote_count: number;
}

interface VoteLeaders {
  topRestaurant: VoteLeader | null;
  topDate: DateLeader | null;
  activePoll: any | null;
}

/**
 * Fetches vote leaders for the active poll
 *
 * IMPORTANT: This is the single source of truth for vote leader queries.
 * Both admin pages use this to ensure consistent data.
 *
 * @param db - D1 database instance
 * @returns Vote leaders for the active poll
 */
export async function getActivePollLeaders(db: any): Promise<VoteLeaders> {
  // Get active poll
  const activePoll = await db
    .prepare(`
      SELECT * FROM polls
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .first();

  let topRestaurant = null;
  let topDate = null;

  if (activePoll) {
    // Fetch top restaurant for active poll
    topRestaurant = await db
      .prepare(`
        SELECT
          rs.id,
          rs.name,
          rs.address,
          COUNT(rv.id) as vote_count
        FROM restaurant_suggestions rs
        LEFT JOIN restaurant_votes rv ON rs.id = rv.suggestion_id
        WHERE rs.poll_id = ?
        GROUP BY rs.id
        HAVING vote_count > 0
        ORDER BY vote_count DESC
        LIMIT 1
      `)
      .bind(activePoll.id)
      .first();

    // Fetch top date for active poll
    topDate = await db
      .prepare(`
        SELECT
          ds.id,
          ds.suggested_date,
          COUNT(dv.id) as vote_count
        FROM date_suggestions ds
        LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id
        WHERE ds.poll_id = ?
        GROUP BY ds.id
        HAVING vote_count > 0
        ORDER BY vote_count DESC
        LIMIT 1
      `)
      .bind(activePoll.id)
      .first();
  }

  return {
    topRestaurant: topRestaurant || null,
    topDate: topDate || null,
    activePoll: activePoll || null,
  };
}
