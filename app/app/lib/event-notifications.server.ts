import { logErrorEvent, logInfoEvent } from "./observability.server";

interface NotificationContext {
  db: any;
  env: {
    RESEND_API_KEY?: string;
  };
  waitUntil?: (promise: Promise<unknown>) => void;
}

interface EventInviteDetails {
  eventId: number;
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime: string;
}

interface EventCancellationDetails extends EventInviteDetails {
  sequence: number;
}

interface EmailOnlyRow {
  email: string;
  rsvp_status?: "yes" | "no" | "maybe" | null;
}

function dispatchPromise(
  waitUntil: NotificationContext["waitUntil"],
  promise: Promise<unknown>
): Promise<void> {
  if (waitUntil) {
    waitUntil(promise);
    return Promise.resolve();
  }

  return promise.then(() => undefined);
}

export async function sendEventInvitesToActiveMembers(
  context: NotificationContext,
  details: EventInviteDetails
): Promise<void> {
  const usersResult = await context.db
    .prepare("SELECT email FROM users WHERE status = 'active'")
    .all();

  const recipientEmails = ((usersResult.results || []) as EmailOnlyRow[]).map((user) => user.email);
  if (recipientEmails.length === 0) {
    return;
  }

  const { sendEventInvites } = await import("./email.server");
  const promise = sendEventInvites({
    ...details,
    recipientEmails,
    resendApiKey: context.env.RESEND_API_KEY || "",
  })
    .then((result) => {
      logInfoEvent("calendar_invite_batch_completed");
      if (result.errors.length > 0) {
        logErrorEvent("calendar_invite_batch_partially_failed");
      }
    })
    .catch((error) => {
      logErrorEvent("calendar_invite_batch_failed", error);
    });

  await dispatchPromise(context.waitUntil, promise);
}

export async function sendEventUpdatesToActiveMembers(
  context: NotificationContext,
  details: EventInviteDetails
): Promise<void> {
  const usersResult = await context.db
    .prepare(`
      SELECT u.email, r.status as rsvp_status
      FROM users u
      LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?
      WHERE u.status = 'active'
    `)
    .bind(details.eventId)
    .all();

  if (!usersResult.results || usersResult.results.length === 0) {
    return;
  }

  const eventMeta = await context.db
    .prepare("SELECT calendar_sequence FROM events WHERE id = ?")
    .bind(details.eventId)
    .first();
  const calendarSequence = Number(eventMeta?.calendar_sequence ?? 1);

  const { sendEventUpdate } = await import("./email.server");
  const promise = Promise.all(
    ((usersResult.results || []) as EmailOnlyRow[]).map((user) =>
      sendEventUpdate({
        ...details,
        userEmail: user.email,
        rsvpStatus: user.rsvp_status ?? undefined,
        sequence: calendarSequence,
        resendApiKey: context.env.RESEND_API_KEY || "",
      }).catch((error) => {
        logErrorEvent("calendar_update_recipient_failed", error);
        return { success: false };
      })
    )
  )
    .then(() => {
      logInfoEvent("calendar_update_batch_completed");
    })
    .catch((error) => {
      logErrorEvent("calendar_update_batch_failed", error);
    });

  await dispatchPromise(context.waitUntil, promise);
}

export async function sendEventCancellationToActiveMembers(
  context: NotificationContext,
  details: EventCancellationDetails
): Promise<void> {
  const usersResult = await context.db
    .prepare(`
      SELECT u.email
      FROM users u
      WHERE u.status = 'active'
    `)
    .all();

  if (!usersResult.results || usersResult.results.length === 0) {
    return;
  }

  const { sendEventCancellation } = await import("./email.server");
  const promise = Promise.all(
    ((usersResult.results || []) as EmailOnlyRow[]).map((user) =>
      sendEventCancellation({
        ...details,
        userEmail: user.email,
        resendApiKey: context.env.RESEND_API_KEY || "",
      }).catch((error) => {
        logErrorEvent("calendar_cancellation_recipient_failed", error);
        return { success: false };
      })
    )
  )
    .then(() => {
      logInfoEvent("calendar_cancellation_batch_completed");
    })
    .catch((error) => {
      logErrorEvent("calendar_cancellation_batch_failed", error);
    });

  await dispatchPromise(context.waitUntil, promise);
}
