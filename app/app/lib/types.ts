/**
 * Shared domain types used across routes and server utilities.
 *
 * Types that originate in a specific lib module (e.g. Restaurant in
 * restaurants.server.ts) are re-exported here so routes can import
 * everything from one place.
 */

// Re-export types that already live in their own modules
export type { AuthUser } from "./auth.server";
export type { Restaurant, RestaurantWithVotes } from "./restaurants.server";
export type { Comment, CommentableType } from "./comments.server";
export type { ActivityType, LogActivityParams } from "./activity.server";

// ─── Event ──────────────────────────────────────────────────────────────────

export interface Event {
  id: number;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  event_time: string | null;
  status: string;
  calendar_sequence?: number;
  created_by: number | null;
  created_at: string;
}

// ─── RSVP ───────────────────────────────────────────────────────────────────

export interface Rsvp {
  id: number;
  event_id: number;
  user_id: number;
  status: "yes" | "no" | "maybe";
  comments: string | null;
  dietary_restrictions: string | null;
  admin_override: number;
  created_at: string;
  updated_at: string | null;
}

/** RSVP row joined with user info — used in event attendee lists */
export interface RsvpWithUser extends Rsvp {
  name: string | null;
  email: string;
  picture: string | null;
}

export type RsvpEventSource =
  | "website"
  | "calendar_email"
  | "sms"
  | "admin_override"
  | "poll_default";

export interface RsvpEvent {
  id: number;
  event_id: number;
  user_id: number;
  actor_user_id: number | null;
  source: RsvpEventSource;
  previous_status: "yes" | "no" | "maybe" | null;
  new_status: "yes" | "no" | "maybe";
  previous_comments: string | null;
  new_comments: string | null;
  previous_admin_override: number;
  new_admin_override: number;
  created_at: string;
}

// ─── Poll ───────────────────────────────────────────────────────────────────

export interface Poll {
  id: number;
  title: string;
  description?: string;
  status: "active" | "closed";
  start_date: string | null;
  end_date: string | null;
  winning_restaurant_id: number | null;
  winning_date_id: number | null;
  created_event_id: number | null;
  created_by: number;
  closed_by: number | null;
  created_at: string;
  closed_at: string | null;
}

export interface VoteLeader {
  id: number;
  name: string;
  address: string | null;
  vote_count: number;
}

export interface DateLeader {
  id: number;
  suggested_date: string;
  vote_count: number;
}

export interface VoteLeaders {
  topRestaurant: VoteLeader | null;
  topDate: DateLeader | null;
  activePoll: Poll | null;
}

/** Simplified vote winner returned from poll leader queries (restaurant) */
export interface VoteWinner {
  name: string;
  address: string | null;
  vote_count: number;
}

/** Simplified vote winner returned from poll leader queries (date) */
export interface DateWinner {
  suggested_date: string;
  vote_count: number;
}

// ─── Date Suggestion ────────────────────────────────────────────────────────

export interface DateSuggestion {
  id: number;
  user_id: number;
  poll_id: number;
  suggested_date: string;
  created_at: string;
}

// ─── Member (admin view — subset of AuthUser) ───────────────────────────────

export interface Member {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  is_admin: number;
  status: string;
  created_at: string;
}

// ─── Email Template ─────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  html_body: string;
  text_body: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

// ─── Site Content ───────────────────────────────────────────────────────────

export interface ContentItem {
  id: number;
  key: string;
  title: string;
  content: string;
  updated_at: string;
}
