import { auth } from '@/auth';
import { getDb, getUserByEmail, ensureUser } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// POST /api/dates/vote - Vote for a date (or remove vote)
export const POST = auth(async function POST(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { date_suggestion_id, action } = body;

    if (!date_suggestion_id) {
      return NextResponse.json(
        { error: 'date_suggestion_id is required' },
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

    // Check if vote already exists
    const existingVote = await db
      .prepare(
        'SELECT id FROM date_votes WHERE date_suggestion_id = ? AND user_id = ?'
      )
      .bind(date_suggestion_id, userId)
      .first();

    if (action === 'remove' || existingVote) {
      // Remove the vote (toggle functionality)
      if (existingVote) {
        await db
          .prepare('DELETE FROM date_votes WHERE id = ?')
          .bind(existingVote.id)
          .run();

        return NextResponse.json({
          message: 'Vote removed',
          voted: false,
        });
      } else {
        return NextResponse.json(
          { error: 'No vote found to remove' },
          { status: 404 }
        );
      }
    } else {
      // Add a new vote
      if (existingVote) {
        return NextResponse.json(
          { message: 'Already voted', voted: true },
          { status: 200 }
        );
      }

      const result = await db
        .prepare(
          'INSERT INTO date_votes (date_suggestion_id, user_id) VALUES (?, ?)'
        )
        .bind(date_suggestion_id, userId)
        .run();

      if (!result.success) {
        throw new Error('Failed to create vote');
      }

      return NextResponse.json(
        { message: 'Vote added', voted: true },
        { status: 201 }
      );
    }
  } catch (error) {
    console.error('Error voting for date:', error);
    return NextResponse.json(
      { error: 'Failed to vote for date' },
      { status: 500 }
    );
  }
});

// DELETE /api/dates/vote?date_suggestion_id=123 - Remove vote
export const DELETE = auth(async function DELETE(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateSuggestionId = searchParams.get('date_suggestion_id');

    if (!dateSuggestionId) {
      return NextResponse.json(
        { error: 'date_suggestion_id is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const user = await getUserByEmail(db, session.user.email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const result = await db
      .prepare(
        'DELETE FROM date_votes WHERE date_suggestion_id = ? AND user_id = ?'
      )
      .bind(dateSuggestionId, user.id)
      .run();

    if (result.meta.changes === 0) {
      return NextResponse.json({ error: 'Vote not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Vote removed' });
  } catch (error) {
    console.error('Error removing vote:', error);
    return NextResponse.json(
      { error: 'Failed to remove vote' },
      { status: 500 }
    );
  }
});
