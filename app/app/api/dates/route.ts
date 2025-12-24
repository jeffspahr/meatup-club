import { auth } from '@/auth';
import { getDb, getUserByEmail, ensureUser } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// GET /api/dates?event_id=123 - List date suggestions with vote counts
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
      FROM date_suggestions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN date_votes v ON s.id = v.date_suggestion_id
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

    query += ' GROUP BY s.id ORDER BY vote_count DESC, s.suggested_date ASC';

    const stmt = db.prepare(query);
    const result = await stmt.bind(...params).all();

    return NextResponse.json({ suggestions: result.results || [] });
  } catch (error) {
    console.error('Error fetching date suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch date suggestions' },
      { status: 500 }
    );
  }
}

// POST /api/dates - Create a new date suggestion
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { event_id, suggested_date } = body;

    if (!suggested_date) {
      return NextResponse.json(
        { error: 'Date is required' },
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

    // Check if this user already suggested this exact date for this event
    const existing = await db
      .prepare(
        'SELECT id FROM date_suggestions WHERE user_id = ? AND event_id = ? AND suggested_date = ?'
      )
      .bind(userId, targetEventId, suggested_date)
      .first();

    if (existing) {
      return NextResponse.json(
        { error: 'You already suggested this date' },
        { status: 400 }
      );
    }

    // Create the suggestion
    const result = await db
      .prepare(
        'INSERT INTO date_suggestions (user_id, event_id, suggested_date) VALUES (?, ?, ?)'
      )
      .bind(userId, targetEventId, suggested_date)
      .run();

    if (!result.success) {
      throw new Error('Failed to create date suggestion');
    }

    const newSuggestion = await db
      .prepare('SELECT * FROM date_suggestions WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return NextResponse.json({ suggestion: newSuggestion }, { status: 201 });
  } catch (error) {
    console.error('Error creating date suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to create date suggestion' },
      { status: 500 }
    );
  }
}
