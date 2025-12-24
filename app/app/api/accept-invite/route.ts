import { auth } from '@/auth';
import { getDb, getUserByEmail } from '@/lib/db';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

// POST /api/accept-invite - Accept invitation and activate account
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

    if (user.status === 'active') {
      return NextResponse.json({ error: 'Account already active' }, { status: 400 });
    }

    // Activate the user account
    await db
      .prepare('UPDATE users SET status = ? WHERE id = ?')
      .bind('active', user.id)
      .run();

    return NextResponse.json({ message: 'Account activated successfully' });
  } catch (error) {
    console.error('Error accepting invite:', error);
    return NextResponse.json(
      { error: 'Failed to accept invitation' },
      { status: 500 }
    );
  }
});
