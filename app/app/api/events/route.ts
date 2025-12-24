import { auth } from '@/auth';
import { getDb, isUserActive, getUserByEmail } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// GET /api/events - List all events (upcoming and past)
export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();

    // Check if user is active
    if (!await isUserActive(db, session.user.email)) {
      return NextResponse.json({ error: 'Account not activated' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // upcoming, completed, cancelled, or all

    let query = 'SELECT * FROM events';
    const params: string[] = [];

    if (status && status !== 'all') {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY event_date DESC';

    const stmt = db.prepare(query);
    const result = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    return NextResponse.json({ events: result.results || [] });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
});

// POST /api/events - Create a new event (admin only)
export const POST = auth(async function POST(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();

    // Check if user is active
    if (!await isUserActive(db, session.user.email)) {
      return NextResponse.json({ error: 'Account not activated' }, { status: 403 });
    }

    // Check if user is admin
    const user = await getUserByEmail(db, session.user.email);
    if (!user?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { restaurant_name, restaurant_address, event_date } = body;

    if (!restaurant_name || !event_date) {
      return NextResponse.json(
        { error: 'restaurant_name and event_date are required' },
        { status: 400 }
      );
    }

    const result = await db
      .prepare(
        'INSERT INTO events (restaurant_name, restaurant_address, event_date, status) VALUES (?, ?, ?, ?)'
      )
      .bind(restaurant_name, restaurant_address || null, event_date, 'upcoming')
      .run();

    if (!result.success) {
      throw new Error('Failed to create event');
    }

    const newEvent = await db
      .prepare('SELECT * FROM events WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return NextResponse.json({ event: newEvent }, { status: 201 });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      { error: 'Failed to create event' },
      { status: 500 }
    );
  }
});
