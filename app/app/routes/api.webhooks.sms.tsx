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
  const env = context.cloudflare.env;
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
  if (messageSid) {
    const isFirstDelivery = await reserveWebhookDelivery(db, "twilio", messageSid);
    if (!isFirstDelivery) {
      return twilioOptOutType
        ? buildSmsResponse()
        : buildSmsResponse("Thanks! We already received that response.");
    }
  }

  const fromRaw = formData.get("From")?.toString() || "";
  const body = formData.get("Body")?.toString() || "";
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

  const parsedBodyReply = parseSmsReply(body);
  // YES and NO are Meatup RSVP commands. Give them precedence in case a
  // Messaging Service was mistakenly configured to classify YES as START.
  const replyType =
    parsedBodyReply === "yes" || parsedBodyReply === "no"
      ? parsedBodyReply
      : twilioOptOutType ?? parsedBodyReply;
  const twilioAlreadyReplied =
    twilioOptOutType !== null && twilioOptOutType === replyType;

  if (replyType === "opt_out") {
    await db
      .prepare("UPDATE users SET sms_opt_in = 0, sms_opt_out_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(user.id)
      .run();
    return twilioAlreadyReplied
      ? buildSmsResponse()
      : buildSmsResponse("You are opted out of Meatup SMS. Reply START to re-enable.");
  }

  if (replyType === "opt_in") {
    await db
      .prepare("UPDATE users SET sms_opt_in = 1, sms_opt_out_at = NULL WHERE id = ?")
      .bind(user.id)
      .run();
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
    return buildSmsResponse("You are opted out of SMS. Update your profile if you'd like reminders again.");
  }

  const latestReminder = await db
    .prepare("SELECT event_id FROM sms_reminders WHERE user_id = ? ORDER BY sent_at DESC LIMIT 1")
    .bind(user.id)
    .first() as SmsReminderRow | null;

  let eventId = latestReminder?.event_id;

  if (!eventId) {
    const timeZone = getAppTimeZone(env.APP_TIMEZONE);
    const today = getTodayDateStringInTimeZone(timeZone);
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
