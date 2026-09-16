import type { Route } from "./+types/api.webhooks.sms";
import {
  buildSmsResponse,
  normalizePhoneNumber,
  parseSmsReply,
  parseTwilioOptOutType,
  verifyTwilioSignature,
} from "../lib/sms.server";
import { getAppTimeZone, getEventDateTimeUtc } from "../lib/dateUtils";
import { upsertRsvp } from "../lib/rsvps.server";
import { reserveWebhookDelivery } from "../lib/webhook-idempotency.server";
import { prepareSmsConsentEvent } from "../lib/sms-consent.server";
import { getCloudflareContext } from "~/lib/router-context";

interface SmsWebhookUserRow {
  id: number;
  status: string;
  sms_opt_in: number;
  sms_opt_out_at: string | null;
}

interface SmsReminderRow {
  event_id: number;
}

interface SmsRsvpEventRow {
  event_id: number;
  restaurant_name: string;
  event_date: string;
  event_time: string | null;
  status: string;
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
  // YES, NO, and MAYBE are Meatup RSVP commands. Give them precedence in case a
  // Messaging Service was mistakenly configured to classify YES as START.
  const replyType =
    parsedBodyReply === "yes" || parsedBodyReply === "no" || parsedBodyReply === "maybe"
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
    .prepare("SELECT id, status, sms_opt_in, sms_opt_out_at FROM users WHERE phone_number = ?")
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
          "Meatup.Club reminders. Reply YES, NO or MAYBE followed by the event number in your invitation to RSVP, STOP to opt out, or START to re-enable. Help: support@meatup.club."
        );
  }

  if (user.status !== "active") {
    return buildSmsResponse("Your account must be active to RSVP. Visit https://meatup.club for help.");
  }

  if (user.sms_opt_in !== 1) {
    return buildSmsResponse("SMS reminders are disabled for your account.");
  }

  if (user.sms_opt_out_at) {
    return buildSmsResponse("You are opted out of SMS. Reply START to re-enable reminders.");
  }

  const eventNumberMatch = body.trim().match(/^(?:yes|y|no|n|maybe)\s+(\d+)[.!]?$/i);
  const explicitEventId = eventNumberMatch ? Number(eventNumberMatch[1]) : null;
  if (
    (/\d/.test(body) && !eventNumberMatch) ||
    (explicitEventId !== null && (!Number.isSafeInteger(explicitEventId) || explicitEventId <= 0))
  ) {
    return buildSmsResponse("Use the event number from your invitation, for example YES 42, NO 42 or MAYBE 42.");
  }

  const reminder = explicitEventId !== null
    ? await db
      .prepare("SELECT event_id FROM sms_reminders WHERE user_id = ? AND event_id = ? LIMIT 1")
      .bind(user.id, explicitEventId)
      .first<SmsReminderRow>()
    : await db
      .prepare("SELECT event_id FROM sms_reminders WHERE user_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1")
      .bind(user.id)
      .first<SmsReminderRow>();
  if (!reminder) {
    return buildSmsResponse("We couldn't find an SMS invitation for that event. RSVP at https://meatup.club/dashboard.");
  }

  const eventId = reminder.event_id;
  const event = await db
    .prepare("SELECT id AS event_id, restaurant_name, event_date, event_time, status FROM events WHERE id = ?")
    .bind(eventId)
    .first<SmsRsvpEventRow>();
  if (
    !event || event.status !== "upcoming" ||
    !(getEventDateTimeUtc(event.event_date, event.event_time, getAppTimeZone(env.APP_TIMEZONE)).getTime() > Date.now())
  ) {
    return buildSmsResponse("That event is no longer accepting RSVPs. View upcoming events at https://meatup.club/dashboard.");
  }

  await upsertRsvp({
    db,
    eventId,
    userId: user.id,
    status: replyType,
  });

  const confirmation = replyType.charAt(0).toUpperCase() + replyType.slice(1);
  return buildSmsResponse(`Thanks! Your RSVP for ${event.restaurant_name} (event ${eventId}) is set to ${confirmation}.`);
}
