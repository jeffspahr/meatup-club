import { createCookieSessionStorage } from "react-router";

type SessionData = {
  userId: number;
  email: string;
  oauth_state: string;
};

type SessionFlashData = {
  error: string;
};

// Session storage using cookies (works well with Cloudflare)
export const sessionStorage = createCookieSessionStorage<
  SessionData,
  SessionFlashData
>({
  cookie: {
    name: "__session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET || "default-secret-change-in-production"],
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;
