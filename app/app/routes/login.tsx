import { redirect } from "react-router";
import type { Route } from "./+types/login";
import { getSession, commitSession } from "../lib/session.server";
import { getGoogleAuthUrl } from "../lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  // Generate state for CSRF protection
  const state = crypto.randomUUID();

  // Store state in session
  const session = await getSession(request.headers.get("Cookie"));
  session.set("oauth_state", state);

  // Get the callback URL
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/auth/google/callback`;

  // Get Google OAuth URL
  const googleAuthUrl = getGoogleAuthUrl(redirectUri, state);

  // Redirect to Google OAuth
  return redirect(googleAuthUrl, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}
