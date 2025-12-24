import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { ensureUser, getDb } from '@/lib/db';

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
        // Store user in D1 database on sign-in
        const db = getDb();
        await ensureUser(db, user.email!, user.name || undefined, user.image || undefined);
        return true;
      } catch (error) {
        console.error('Error storing user in database:', error);
        return true; // Allow sign-in even if DB fails
      }
    },
  },
  pages: {
    signIn: '/login',
  },
});
