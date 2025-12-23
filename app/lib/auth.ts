import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { ensureUser, getDb } from './db';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Ensure user exists in D1 database
      if (user.email) {
        try {
          const db = getDb();
          await ensureUser(db, user.email, user.name || undefined, user.image || undefined);
          return true;
        } catch (error) {
          console.error('Error creating user in database:', error);
          return false;
        }
      }
      return false;
    },
    async session({ session, token }) {
      // Add user ID to session if needed
      if (session.user && token.sub) {
        // @ts-ignore
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
