import { createCookieSessionStorage } from "react-router";

type SessionData = {
  userId: number;
  email: string;
  oauth_state: string;
};

type SessionFlashData = {
  error: string;
};

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV !== "test") {
  throw new Error("SESSION_SECRET must be configured");
}

const sessionSecrets = [sessionSecret || "test-session-secret"];

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
    secrets: sessionSecrets,
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;
