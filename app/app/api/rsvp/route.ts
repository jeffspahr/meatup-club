import { auth } from '@/auth';
import { getDb, getUserByEmail, ensureUser } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// GET /api/rsvp?event_id=123 - Get user's RSVP for an event and list of all RSVPs
export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');

    if (!eventId) {
      return NextResponse.json(
        { error: 'event_id is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const user = await getUserByEmail(db, session.user.email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user's RSVP
    const userRsvp = await db
      .prepare('SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?')
      .bind(eventId, user.id)
      .first();

    // Get all RSVPs for this event with user details
    const allRsvps = await db
      .prepare(`
        SELECT r.*, u.name, u.email, u.picture
        FROM rsvps r
        JOIN users u ON r.user_id = u.id
        WHERE r.event_id = ?
        ORDER BY r.created_at ASC
      `)
      .bind(eventId)
      .all();

    return NextResponse.json({
      userRsvp: userRsvp || null,
      allRsvps: allRsvps.results || [],
    });
  } catch (error) {
    console.error('Error fetching RSVP:', error);
    return NextResponse.json(
      { error: 'Failed to fetch RSVP' },
      { status: 500 }
    );
  }
});

// POST /api/rsvp - Create or update RSVP
export const POST = auth(async function POST(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { event_id, status, dietary_restrictions } = body;

    if (!event_id || !status) {
      return NextResponse.json(
        { error: 'event_id and status are required' },
        { status: 400 }
      );
    }

    if (!['yes', 'no', 'maybe'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be yes, no, or maybe' },
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

    // Check if RSVP already exists
    const existing = await db
      .prepare('SELECT id FROM rsvps WHERE event_id = ? AND user_id = ?')
      .bind(event_id, userId)
      .first();

    let result;
    if (existing) {
      // Update existing RSVP
      result = await db
        .prepare(
          'UPDATE rsvps SET status = ?, dietary_restrictions = ? WHERE id = ?'
        )
        .bind(status, dietary_restrictions || null, existing.id)
        .run();
    } else {
      // Create new RSVP
      result = await db
        .prepare(
          'INSERT INTO rsvps (event_id, user_id, status, dietary_restrictions) VALUES (?, ?, ?, ?)'
        )
        .bind(event_id, userId, status, dietary_restrictions || null)
        .run();
    }

    if (!result.success) {
      throw new Error('Failed to save RSVP');
    }

    // Fetch the updated RSVP
    const rsvpId = existing ? existing.id : result.meta.last_row_id;
    const rsvp = await db
      .prepare('SELECT * FROM rsvps WHERE id = ?')
      .bind(rsvpId)
      .first();

    return NextResponse.json({ rsvp }, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error('Error saving RSVP:', error);
    return NextResponse.json(
      { error: 'Failed to save RSVP' },
      { status: 500 }
    );
  }
});
