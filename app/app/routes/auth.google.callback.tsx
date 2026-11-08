import type { Route } from "./+types/auth.google.callback";
import { getCloudflareContext } from "~/lib/router-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  // Import server-only modules inside loader to prevent client bundling
  const { getSession } = await import("../lib/session.server");
  const { getGoogleTokens, getGoogleUserInfo, createUserSession } = await import("../lib/auth.server");
  const { ensureUser, getUserByEmail } = await import("../lib/db.server");
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

  // Validate the provider's email claim before looking up or changing an account.
  if (
    googleUser?.verified_email !== true ||
    typeof googleUser.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(googleUser.email)
  ) {
    throw new Response("Google did not provide a verified email address", { status: 403 });
  }

  // Google is authoritative for Gmail and verified Workspace addresses only.
  // A verified external address without hd may have changed mailbox owners.
  const isGmail = googleUser.email.toLowerCase().endsWith("@gmail.com");
  const isWorkspace = typeof googleUser.hd === "string" && googleUser.hd.trim().length > 0;
  if (!isGmail && !isWorkspace) {
    throw new Response("Sign in with a Gmail or Google Workspace account", { status: 403 });
  }

  // Ensure user exists in database
  const db = getCloudflareContext(context).env.DB;
  const userId = await ensureUser(
    db,
    googleUser.email,
    googleUser.name,
    googleUser.picture
  );

  // Read the current session generation after completing fresh authentication.
  const user = await getUserByEmail(db, googleUser.email);
  if (!user) {
    throw new Error("User no longer exists");
  }
  const active = user.status === "active";

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
    return createUserSession(userId, googleUser.email, "/dashboard", user.session_version);
  }
  return createUserSession(
    userId,
    googleUser.email,
    user.status === "invited" ? "/accept-invite" : "/pending",
    user.session_version
  );
}
