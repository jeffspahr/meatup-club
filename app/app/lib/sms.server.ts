import { createHmac } from "node:crypto";
import { getAppTimeZone } from "./dateUtils";
import type { D1Database } from "./db.server";

type SmsEnv = {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  APP_TIMEZONE?: string;
};

export type SmsEvent = {
  id: number;
  restaurant_name: string;
  restaurant_address?: string | null;
  event_date: string;
  event_time?: string | null;
};

export type SmsRecipientScope = "all" | "yes" | "no" | "maybe" | "pending" | "specific";

const OPT_OUT_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const HELP_KEYWORDS = new Set(["help", "info"]);
const YES_KEYWORDS = new Set(["y", "yes"]);
const NO_KEYWORDS = new Set(["n", "no"]);

export function normalizePhoneNumber(input: string): string | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/[^\d+]/g, "");
    return digits.length >= 11 ? digits : null;
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }

  return null;
}

export function parseSmsReply(body: string): "yes" | "no" | "opt_out" | "help" | null {
  if (!body) {
    return null;
  }

  const normalized = body.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const condensed = normalized.replace(/[^a-z]/g, "");
  if (OPT_OUT_KEYWORDS.has(condensed) || OPT_OUT_KEYWORDS.has(normalized)) {
    return "opt_out";
  }

  if (HELP_KEYWORDS.has(condensed) || HELP_KEYWORDS.has(normalized)) {
    return "help";
  }

  const token = (normalized.match(/[a-z]+/) || [])[0] || condensed;

  if (YES_KEYWORDS.has(token)) {
    return "yes";
  }

  if (NO_KEYWORDS.has(token)) {
    return "no";
  }

  return null;
}

export function buildSmsReminderMessage({
  event,
  timeZone,
  rsvpStatus,
  now,
  customMessage,
}: {
  event: SmsEvent;
  timeZone: string;
  rsvpStatus?: string | null;
  now?: Date;
  customMessage?: string | null;
}): string {
  const messageNow = now || new Date();
  const { dateLabel, timeLabel, relativeLabel } = formatEventDateTimeForSms(
    event,
    timeZone,
    messageNow
  );
  const statusLabel = formatRsvpStatus(rsvpStatus);
  const baseTemplate = `Meatup.Club: Reminder for ${relativeLabel ?? dateLabel} at ${timeLabel} at ${event.restaurant_name}.`;
  const messageBody = customMessage
    ? `Meatup.Club: ${customMessage.trim()} ${baseTemplate.replace("Meatup.Club: ", "")}`
    : baseTemplate;
  const base = `${messageBody} Your RSVP: ${statusLabel}. Details: https://meatup.club/dashboard/events`;
  return appendSmsInstructions(base);
}

export async function sendSms({
  to,
  body,
  env,
}: {
  to: string;
  body: string;
  env: SmsEnv;
}): Promise<{ success: boolean; error?: string }> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const fromNumber = env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: "Missing Twilio credentials." };
  }

  const params = new URLSearchParams();
  params.set("To", to);
  params.set("From", fromNumber);
  params.set("Body", body);

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: errorText };
  }

  return { success: true };
}

export async function sendScheduledSmsReminders({
  db,
  env,
  now = new Date(),
}: {
  db: D1Database;
  env: SmsEnv;
  now?: Date;
}): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    console.warn("Twilio credentials are missing; skipping SMS reminders.");
    return;
  }

  const timeZone = getAppTimeZone(env.APP_TIMEZONE);
  const eventsResult = await db
    .prepare("SELECT id, restaurant_name, event_date, event_time, status FROM events WHERE status = 'upcoming'")
    .all();

  const events = (eventsResult.results || []) as SmsEvent[];
  if (events.length === 0) {
    return;
  }

  const reminderTargets = [
    { type: "24h", offsetMs: 24 * 60 * 60 * 1000 },
    { type: "2h", offsetMs: 2 * 60 * 60 * 1000 },
  ];
  const windowMs = 15 * 60 * 1000;

  for (const event of events) {
    const eventDateTime = getEventDateTimeUtc(event.event_date, event.event_time, timeZone);
    const diffMs = eventDateTime.getTime() - now.getTime();

    for (const target of reminderTargets) {
      if (!isWithinWindow(diffMs, target.offsetMs, windowMs)) {
        continue;
      }

      const recipients = await db
        .prepare(`
          SELECT u.id, u.phone_number, r.status as rsvp_status
          FROM users u
          LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?
          WHERE u.status = 'active'
            AND u.sms_opt_in = 1
            AND u.sms_opt_out_at IS NULL
            AND u.phone_number IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM sms_reminders sr
              WHERE sr.user_id = u.id
                AND sr.event_id = ?
                AND sr.reminder_type = ?
            )
        `)
        .bind(event.id, event.id, target.type)
        .all();

      for (const recipient of recipients.results || []) {
        const to = (recipient as any).phone_number as string;
        const rsvpStatus = (recipient as any).rsvp_status as string | null;
        const body = buildSmsReminderMessage({
          event,
          timeZone,
          rsvpStatus,
          now,
        });
        const result = await sendSms({ to, body, env });
        if (result.success) {
          await db
            .prepare(
              "INSERT OR IGNORE INTO sms_reminders (event_id, user_id, reminder_type) VALUES (?, ?, ?)"
            )
            .bind(event.id, (recipient as any).id, target.type)
            .run();
        } else {
          console.error(`SMS reminder failed for ${to}: ${result.error}`);
        }
      }
    }
  }
}

export async function sendAdhocSmsReminder({
  db,
  env,
  event,
  customMessage,
  recipientScope = "all",
  recipientUserId,
}: {
  db: D1Database;
  env: SmsEnv;
  event: SmsEvent;
  customMessage?: string | null;
  recipientScope?: SmsRecipientScope;
  recipientUserId?: number | null;
}): Promise<{ sent: number; errors: string[] }> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    return { sent: 0, errors: ["Twilio credentials are missing."] };
  }

  const timeZone = getAppTimeZone(env.APP_TIMEZONE);
  const recipientQuery = buildRecipientScopeQuery(recipientScope, recipientUserId);
  const recipients = await db
    .prepare(`
      SELECT u.id, u.phone_number, r.status as rsvp_status
      FROM users u
      LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?
      WHERE u.status = 'active'
        AND u.sms_opt_in = 1
        AND u.sms_opt_out_at IS NULL
        AND u.phone_number IS NOT NULL
        ${recipientQuery.sql}
    `)
    .bind(event.id, ...recipientQuery.bindings)
    .all();

  const reminderType = `adhoc:${Date.now()}`;
  let sent = 0;
  const errors: string[] = [];

  for (const recipient of recipients.results || []) {
    const to = (recipient as any).phone_number as string;
    const rsvpStatus = (recipient as any).rsvp_status as string | null;
    const message = buildSmsReminderMessage({
      event,
      timeZone,
      rsvpStatus,
      customMessage,
    });
    const result = await sendSms({ to, body: message, env });
    if (result.success) {
      sent += 1;
      await db
        .prepare(
          "INSERT OR IGNORE INTO sms_reminders (event_id, user_id, reminder_type) VALUES (?, ?, ?)"
        )
        .bind(event.id, (recipient as any).id, reminderType)
        .run();
    } else {
      errors.push(`${to}: ${result.error}`);
    }
  }

  return { sent, errors };
}

export function verifyTwilioSignature({
  url,
  params,
  signature,
  authToken,
}: {
  url: string;
  params: URLSearchParams;
  signature: string | null;
  authToken?: string;
}): boolean {
  if (!signature || !authToken) {
    return false;
  }

  const sortedKeys = Array.from(params.keys()).sort();
  const data = sortedKeys.reduce((acc, key) => {
    const value = params.get(key) ?? "";
    return `${acc}${key}${value}`;
  }, url);

  const digest = createHmac("sha1", authToken).update(data).digest("base64");
  return digest === signature;
}

export function buildSmsResponse(message?: string): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response>${
    message ? `<Message>${escapeXml(message)}</Message>` : ""
  }</Response>`;
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

export function formatEventDateTimeForSms(
  event: SmsEvent,
  timeZone: string,
  now: Date
): {
  dateLabel: string;
  timeLabel: string;
  relativeLabel?: string;
} {
  const eventDateTime = getEventDateTimeUtc(event.event_date, event.event_time, timeZone);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(eventDateTime);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(eventDateTime);

  const relativeLabel = getRelativeDateLabel(eventDateTime, now, timeZone);
  return { dateLabel, timeLabel, relativeLabel };
}

export function getEventDateTimeUtc(
  eventDate: string,
  eventTime: string | null | undefined,
  timeZone: string
): Date {
  const [year, month, day] = eventDate.split("-").map(Number);
  const [hour, minute] = (eventTime || "18:00").split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(utcGuess).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {} as Record<string, string>);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offsetMs = asUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

function isWithinWindow(diffMs: number, targetMs: number, windowMs: number): boolean {
  return diffMs <= targetMs && diffMs > targetMs - windowMs;
}

function appendSmsInstructions(message: string): string {
  return `${message} Reply YES or NO to RSVP. Reply STOP to opt out.`;
}

function buildRecipientScopeQuery(
  scope: SmsRecipientScope,
  recipientUserId?: number | null
): { sql: string; bindings: any[] } {
  switch (scope) {
    case "yes":
    case "no":
    case "maybe":
      return { sql: "AND r.status = ?", bindings: [scope] };
    case "pending":
      return { sql: "AND r.status IS NULL", bindings: [] };
    case "specific":
      if (!recipientUserId) {
        return { sql: "AND 1 = 0", bindings: [] };
      }
      return { sql: "AND u.id = ?", bindings: [recipientUserId] };
    case "all":
    default:
      return { sql: "", bindings: [] };
  }
}

function formatRsvpStatus(status?: string | null): string {
  if (!status) {
    return "Pending";
  }

  if (status === "yes") {
    return "Yes";
  }

  if (status === "no") {
    return "No";
  }

  if (status === "maybe") {
    return "Maybe";
  }

  return "Pending";
}

function getRelativeDateLabel(eventDateTime: Date, now: Date, timeZone: string): string | undefined {
  const formatDay = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);

  const today = formatDay(now);
  const eventDay = formatDay(eventDateTime);

  if (eventDay === today) {
    return "today";
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDay = formatDay(tomorrow);
  if (eventDay === tomorrowDay) {
    return "tomorrow";
  }

  return undefined;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
