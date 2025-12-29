import { redirect } from "react-router";
import type { Route } from "./+types/dashboard.rsvp";

/**
 * TEMPORARY BACKWARD COMPATIBILITY REDIRECT (2025-12-29)
 *
 * This route redirects /dashboard/rsvp -> /dashboard/events
 *
 * WHY: The RSVP and Events sections have been merged into a single Events page.
 * Calendar invites sent before this change contain RSVP links pointing to /dashboard/rsvp.
 * This redirect ensures those links continue to work.
 *
 * TODO: Remove this file after 2026-01-02 (after the first event completes)
 * By then, all calendar RSVPs will have been recorded and users will be familiar
 * with the Events page. Future calendar invites will link directly to /dashboard/events.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return redirect('/dashboard/events');
}

export async function action({ request }: Route.ActionArgs) {
  return redirect('/dashboard/events');
}
