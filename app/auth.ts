import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { getUserByEmail, getDb } from '@/lib/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        const db = getDb();

        // Only allow users who have been invited (exist in database)
        const existingUser = await getUserByEmail(db, user.email!);

        if (!existingUser) {
          return false; // Reject users who haven't been invited
        }

        // Update user info (name, picture) on each sign-in
        await db
          .prepare('UPDATE users SET name = ?, picture = ? WHERE email = ?')
          .bind(user.name || null, user.image || null, user.email)
          .run();

        return true;
      } catch (error) {
        console.error('Error during sign-in:', error);
        return false;
      }
    },
  },
  pages: {
    signIn: '/login',
  },
});
