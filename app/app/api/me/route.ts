import { auth } from '@/auth';
import { getDb, getUserByEmail } from '@/lib/db';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

// GET /api/me - Get current user info
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

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      is_admin: user.is_admin === 1,
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user info' },
      { status: 500 }
    );
  }
});
