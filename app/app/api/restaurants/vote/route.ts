import { auth } from '@/auth';
import { getDb, getUserByEmail, ensureUser } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// POST /api/restaurants/vote - Vote for a restaurant (or remove vote)
export const POST = auth(async function POST(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { suggestion_id, action } = body;

    if (!suggestion_id) {
      return NextResponse.json(
        { error: 'suggestion_id is required' },
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
        'SELECT id FROM restaurant_votes WHERE suggestion_id = ? AND user_id = ?'
      )
      .bind(suggestion_id, userId)
      .first();

    if (action === 'remove' || existingVote) {
      // Remove the vote (toggle functionality)
      if (existingVote) {
        await db
          .prepare('DELETE FROM restaurant_votes WHERE id = ?')
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
          'INSERT INTO restaurant_votes (suggestion_id, user_id) VALUES (?, ?)'
        )
        .bind(suggestion_id, userId)
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
    console.error('Error voting for restaurant:', error);
    return NextResponse.json(
      { error: 'Failed to vote for restaurant' },
      { status: 500 }
    );
  }
});

// DELETE /api/restaurants/vote?suggestion_id=123 - Remove vote
export const DELETE = auth(async function DELETE(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const suggestionId = searchParams.get('suggestion_id');

    if (!suggestionId) {
      return NextResponse.json(
        { error: 'suggestion_id is required' },
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
        'DELETE FROM restaurant_votes WHERE suggestion_id = ? AND user_id = ?'
      )
      .bind(suggestionId, user.id)
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
