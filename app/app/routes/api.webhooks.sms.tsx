import type { Route } from "./+types/api.webhooks.sms";
import {
  buildSmsResponse,
  normalizePhoneNumber,
  parseSmsReply,
  parseTwilioOptOutType,
  verifyTwilioSignature,
} from "../lib/sms.server";
import { getAppTimeZone, getTodayDateStringInTimeZone } from "../lib/dateUtils";
import { upsertRsvp } from "../lib/rsvps.server";
import { reserveWebhookDelivery } from "../lib/webhook-idempotency.server";
import { prepareSmsConsentEvent } from "../lib/sms-consent.server";
import { getCloudflareContext } from "~/lib/router-context";

interface SmsWebhookUserRow {
  id: number;
  sms_opt_in: number;
  sms_opt_out_at: string | null;
}

interface SmsReminderRow {
  event_id: number;
}

interface UpcomingEventRow {
  id: number;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getCloudflareContext(context).env;
  const db = env.DB;

  const formData = await request.formData();
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      params.append(key, value);
    }
  }

  const signature = request.headers.get("X-Twilio-Signature");
  const isValid = verifyTwilioSignature({
    url: request.url,
    params,
    signature,
    authToken: env.TWILIO_AUTH_TOKEN,
  });

  if (!isValid) {
    return new Response("Invalid signature", { status: 403 });
  }

  const messageSid = formData.get("MessageSid")?.toString().trim();
  const twilioOptOutType = parseTwilioOptOutType(
    formData.get("OptOutType")?.toString() ?? null
  );
  const fromRaw = formData.get("From")?.toString() || "";
  const body = formData.get("Body")?.toString() || "";
  const parsedBodyReply = parseSmsReply(body);
  // YES and NO are Meatup RSVP commands. Give them precedence in case a
  // Messaging Service was mistakenly configured to classify YES as START.
  const replyType =
    parsedBodyReply === "yes" || parsedBodyReply === "no"
      ? parsedBodyReply
      : twilioOptOutType ?? parsedBodyReply;
  const twilioAlreadyReplied =
    twilioOptOutType !== null && twilioOptOutType === replyType;
  const isConsentCommand = replyType === "opt_in" || replyType === "opt_out";

  // Consent commands are idempotent through the unique provider Message SID
  // on sms_consent_events. Do not reserve them here: a failed consent batch
  // must remain retryable so state and evidence cannot diverge.
  if (messageSid && !isConsentCommand) {
    const isFirstDelivery = await reserveWebhookDelivery(db, "twilio", messageSid);
    if (!isFirstDelivery) {
      return twilioOptOutType
        ? buildSmsResponse()
        : buildSmsResponse("Thanks! We already received that response.");
    }
  }

  const from = normalizePhoneNumber(fromRaw);

  if (!from) {
    return twilioOptOutType
      ? buildSmsResponse()
      : buildSmsResponse("We couldn't read your phone number.");
  }

  const user = await db
    .prepare("SELECT id, sms_opt_in, sms_opt_out_at FROM users WHERE phone_number = ?")
    .bind(from)
    .first() as SmsWebhookUserRow | null;

  if (!user) {
    return twilioOptOutType
      ? buildSmsResponse()
      : buildSmsResponse(
          "We couldn't find your account. Update your phone number in your profile."
        );
  }

  if (replyType === "opt_out") {
    await db.batch([
      db
        .prepare("UPDATE users SET sms_opt_in = 0, sms_opt_out_at = CURRENT_TIMESTAMP, sms_opt_out_source = 'sms' WHERE id = ?")
        .bind(user.id),
      prepareSmsConsentEvent(db, {
        userId: user.id,
        phoneNumber: from,
        eventType: "opt_out",
        source: "sms",
        providerMessageSid: messageSid || null,
      }),
    ]);
    return twilioAlreadyReplied
      ? buildSmsResponse()
      : buildSmsResponse("You are opted out of Meatup SMS. Reply START to re-enable.");
  }

  if (replyType === "opt_in") {
    await db.batch([
      db
        .prepare("UPDATE users SET sms_opt_in = 1, sms_opt_out_at = NULL, sms_opt_out_source = NULL WHERE id = ?")
        .bind(user.id),
      prepareSmsConsentEvent(db, {
        userId: user.id,
        phoneNumber: from,
        eventType: "opt_in",
        source: "sms",
        providerMessageSid: messageSid || null,
      }),
    ]);
    return twilioAlreadyReplied
      ? buildSmsResponse()
      : buildSmsResponse("You are opted in to Meatup SMS reminders. Reply STOP to opt out.");
  }

  if (replyType === "help" || replyType === null) {
    return twilioAlreadyReplied
      ? buildSmsResponse()
      : buildSmsResponse(
          "Meatup.Club reminders. Reply YES or NO to RSVP, STOP to opt out, or START to re-enable. Help: support@meatup.club."
        );
  }

  if (user.sms_opt_in !== 1) {
    return buildSmsResponse("SMS reminders are disabled for your account.");
  }

  if (user.sms_opt_out_at) {
    return buildSmsResponse("You are opted out of SMS. Reply START to re-enable reminders.");
  }

  const timeZone = getAppTimeZone(env.APP_TIMEZONE);
  const today = getTodayDateStringInTimeZone(timeZone);
  const latestReminder = await db
    .prepare(`
      SELECT sr.event_id
      FROM sms_reminders sr
      JOIN events e ON e.id = sr.event_id
      WHERE sr.user_id = ?
        AND e.status = 'upcoming'
        AND e.event_date >= ?
      ORDER BY sr.sent_at DESC
      LIMIT 1
    `)
    .bind(user.id, today)
    .first() as SmsReminderRow | null;

  let eventId = latestReminder?.event_id;

  if (!eventId) {
    const nextEvent = await db
      .prepare(
        "SELECT id FROM events WHERE status = 'upcoming' AND event_date >= ? ORDER BY event_date ASC LIMIT 1"
      )
      .bind(today)
      .first() as UpcomingEventRow | null;
    eventId = nextEvent?.id;
  }

  if (!eventId) {
    return buildSmsResponse("We couldn't find an upcoming event to RSVP for.");
  }

  await upsertRsvp({
    db,
    eventId,
    userId: user.id,
    status: replyType,
  });

  const confirmation = replyType === "yes" ? "Yes" : "No";
  return buildSmsResponse(`Thanks! Your RSVP is set to ${confirmation}.`);
}
