import { auth } from '@/auth';
import { getDb, getUserByEmail } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// GET /api/members - List all members (admin only)
export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const user = await getUserByEmail(db, session.user.email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is admin
    if (!user.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all members
    const members = await db
      .prepare('SELECT id, email, name, picture, is_admin, created_at FROM users ORDER BY created_at DESC')
      .all();

    return NextResponse.json({ members: members.results || [] });
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    );
  }
});

// POST /api/members - Add a new member (admin only)
export const POST = auth(async function POST(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const user = await getUserByEmail(db, session.user.email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is admin
    if (!user.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { email, name } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (existing) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Add new member
    const result = await db
      .prepare('INSERT INTO users (email, name, is_admin) VALUES (?, ?, 0)')
      .bind(email, name || null)
      .run();

    if (!result.success) {
      throw new Error('Failed to add member');
    }

    const newMember = await db
      .prepare('SELECT id, email, name, picture, is_admin, created_at FROM users WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return NextResponse.json({ member: newMember }, { status: 201 });
  } catch (error) {
    console.error('Error adding member:', error);
    return NextResponse.json(
      { error: 'Failed to add member' },
      { status: 500 }
    );
  }
});

// DELETE /api/members?user_id=123 - Remove a member (admin only)
export const DELETE = auth(async function DELETE(request) {
  try {
    const session = request.auth;
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const user = await getUserByEmail(db, session.user.email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is admin
    if (!user.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userIdToDelete = searchParams.get('user_id');

    if (!userIdToDelete) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    // Don't allow deleting yourself
    if (parseInt(userIdToDelete) === user.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Delete the user
    const result = await db
      .prepare('DELETE FROM users WHERE id = ?')
      .bind(userIdToDelete)
      .run();

    if (result.meta.changes === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    );
  }
});
