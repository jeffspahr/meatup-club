import { auth } from '@/auth';
import { getDb, getUserByEmail, ensureUser } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// GET /api/restaurants?event_id=123 - List restaurant suggestions with vote counts
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');

    const db = getDb();
    const user = await getUserByEmail(db, session.user.email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let query = `
      SELECT
        s.*,
        u.name as suggested_by_name,
        u.email as suggested_by_email,
        COUNT(v.id) as vote_count,
        SUM(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) as user_has_voted
      FROM restaurant_suggestions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN restaurant_votes v ON s.id = v.suggestion_id
    `;

    const params: any[] = [user.id];

    if (eventId) {
      query += ' WHERE s.event_id = ?';
      params.push(eventId);
    } else {
      // If no event_id specified, get suggestions for the latest upcoming event
      query += ` WHERE s.event_id = (
        SELECT id FROM events
        WHERE status = 'upcoming'
        ORDER BY event_date ASC
        LIMIT 1
      )`;
    }

    query += ' GROUP BY s.id ORDER BY vote_count DESC, s.created_at DESC';

    const stmt = db.prepare(query);
    const result = await stmt.bind(...params).all();

    return NextResponse.json({ suggestions: result.results || [] });
  } catch (error) {
    console.error('Error fetching restaurant suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch restaurant suggestions' },
      { status: 500 }
    );
  }
}

// POST /api/restaurants - Create a new restaurant suggestion
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { event_id, name, address, cuisine, url } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Restaurant name is required' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Ensure user exists in database
    const userId = await ensureUser(
      db,
      session.user.email,
      session.user.name || undefined,
      session.user.image || undefined
    );

    // If no event_id provided, use the next upcoming event
    let targetEventId = event_id;
    if (!targetEventId) {
      const nextEvent = await db
        .prepare(
          "SELECT id FROM events WHERE status = 'upcoming' ORDER BY event_date ASC LIMIT 1"
        )
        .first();

      if (!nextEvent) {
        return NextResponse.json(
          { error: 'No upcoming event found. Please create an event first.' },
          { status: 400 }
        );
      }

      targetEventId = nextEvent.id;
    }

    // Create the suggestion
    const result = await db
      .prepare(
        'INSERT INTO restaurant_suggestions (user_id, event_id, name, address, cuisine, url) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        userId,
        targetEventId,
        name,
        address || null,
        cuisine || null,
        url || null
      )
      .run();

    if (!result.success) {
      throw new Error('Failed to create restaurant suggestion');
    }

    const newSuggestion = await db
      .prepare('SELECT * FROM restaurant_suggestions WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return NextResponse.json({ suggestion: newSuggestion }, { status: 201 });
  } catch (error) {
    console.error('Error creating restaurant suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to create restaurant suggestion' },
      { status: 500 }
    );
  }
}
