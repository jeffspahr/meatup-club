import type { Route } from "./+types/auth.google.callback";

export async function loader({ request, context }: Route.LoaderArgs) {
  // Import server-only modules inside loader to prevent client bundling
  const { getSession } = await import("../lib/session.server");
  const { getGoogleTokens, getGoogleUserInfo, createUserSession } = await import("../lib/auth.server");
  const { ensureUser, isUserActive } = await import("../lib/db.server");
  const { logActivity } = await import("../lib/activity.server");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    throw new Error("Missing code or state parameter");
  }

  // Verify state to prevent CSRF
  const session = await getSession(request.headers.get("Cookie"));
  const storedState = session.get("oauth_state");

  if (state !== storedState) {
    throw new Error("Invalid state parameter");
  }

  // Exchange code for tokens
  const redirectUri = `${url.origin}/auth/google/callback`;
  const tokens = await getGoogleTokens(code, redirectUri);

  // Get user info from Google
  const googleUser = await getGoogleUserInfo(tokens.access_token);

  // Ensure user exists in database
  const db = context.cloudflare.env.DB;
  const userId = await ensureUser(
    db,
    googleUser.email,
    googleUser.name,
    googleUser.picture
  );

  // Check if user is active
  const active = await isUserActive(db, googleUser.email);

  // Log the login activity
  await logActivity({
    db,
    userId,
    actionType: 'login',
    actionDetails: {
      email: googleUser.email,
      name: googleUser.name,
      active,
    },
    route: '/auth/google/callback',
    request,
  });

  // Create session and redirect
  if (active) {
    return createUserSession(userId, googleUser.email, "/dashboard");
  } else {
    return createUserSession(userId, googleUser.email, "/pending");
  }
}
