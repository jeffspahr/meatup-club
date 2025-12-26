import { redirect } from "react-router";
import type { Route } from "./+types/root";
import { getSession, commitSession, destroySession } from "./session.server";
import { getUserByEmail, isUserActive } from "./db.server";

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  is_admin: number;
  status: string;
  requires_reauth: number;
};

// Get current user from session
export async function getUser(
  request: Request,
  context: Route.LoaderArgs["context"]
): Promise<AuthUser | null> {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  const email = session.get("email");

  if (!userId || !email) {
    return null;
  }

  const db = context.cloudflare.env.DB;
  const user = await getUserByEmail(db, email);

  if (!user) {
    return null;
  }

  return user as AuthUser;
}

// Require authentication - redirect to login if not authenticated
export async function requireAuth(
  request: Request,
  context: Route.LoaderArgs["context"]
): Promise<AuthUser> {
  const user = await getUser(request, context);

  if (!user) {
    throw redirect("/login");
  }

  // Force re-authentication if required
  if (user.requires_reauth === 1) {
    throw await logout(request);
  }

  return user;
}

// Require active user - redirect if not active
export async function requireActiveUser(
  request: Request,
  context: Route.LoaderArgs["context"]
): Promise<AuthUser> {
  const user = await requireAuth(request, context);

  if (user.status !== "active") {
    throw redirect("/pending");
  }

  return user;
}

// Require admin user
export async function requireAdmin(
  request: Request,
  context: Route.LoaderArgs["context"]
): Promise<AuthUser> {
  const user = await requireActiveUser(request, context);

  if (!user.is_admin) {
    throw redirect("/dashboard");
  }

  return user;
}

// Create session for user
export async function createUserSession(
  userId: number,
  email: string,
  redirectTo: string
) {
  const session = await getSession();
  session.set("userId", userId);
  session.set("email", email);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

// Destroy session
export async function logout(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));

  return redirect("/", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

// Google OAuth URLs
export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Exchange code for tokens
export async function getGoogleTokens(code: string, redirectUri: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange code for tokens");
  }

  return response.json();
}

// Get user info from Google
export async function getGoogleUserInfo(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to get user info");
  }

  return response.json();
}
