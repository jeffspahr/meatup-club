import { createHmac } from "node:crypto";
import { getAppTimeZone, getEventDateTimeUtc } from "./dateUtils";
import type { D1Database } from "./db.server";
import { logErrorEvent } from "./observability.server";

type SmsEnv = {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  APP_BASE_URL?: string;
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

type SmsRecipientRow = {
  id: number;
  phone_number: string;
  rsvp_status: string | null;
};

const OPT_OUT_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const OPT_IN_KEYWORDS = new Set(["start", "unstop"]);
const HELP_KEYWORDS = new Set(["help", "info"]);
const YES_KEYWORDS = new Set(["y", "yes"]);
const NO_KEYWORDS = new Set(["n", "no"]);
const SMS_BRAND_PREFIX = "Meatup.Club (888-857-MEAT):";

export type SmsReplyType = "yes" | "no" | "opt_out" | "opt_in" | "help";
export type SmsDeliveryStatus =
  | "creating"
  | "accepted"
  | "scheduled"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed"
  | "canceled"
  | "read";

export type SmsSendResult =
  | { success: true; messageSid: string; status: SmsDeliveryStatus }
  | { success: false; error: string; errorCode?: string };

export type SmsProviderHealthStatus =
  | "healthy"
  | "misconfigured"
  | "authentication_failed"
  | "account_suspended"
  | "account_closed"
  | "provider_error";

export type SmsProviderHealth = {
  status: SmsProviderHealthStatus;
  errorCode: string | null;
  checkedAt: string;
  lastHealthyAt: string | null;
};

type TwilioBindingName =
  | "TWILIO_ACCOUNT_SID"
  | "TWILIO_AUTH_TOKEN"
  | "TWILIO_FROM_NUMBER";

export type TwilioConfigurationStatus = {
  valid: boolean;
  missingBindings: TwilioBindingName[];
  invalidBindings: TwilioBindingName[];
};

const SMS_STATUS_RANK: Record<SmsDeliveryStatus, number> = {
  creating: 0,
  accepted: 10,
  scheduled: 10,
  queued: 20,
  sending: 30,
  sent: 40,
  delivered: 50,
  undelivered: 50,
  failed: 50,
  canceled: 50,
  read: 60,
};

const TWILIO_MESSAGE_SID_PATTERN = /^SM[a-fA-F0-9]{32}$/;
const TWILIO_ACCOUNT_SID_PATTERN = /^AC[a-fA-F0-9]{32}$/;
const E164_PHONE_NUMBER_PATTERN = /^\+[1-9]\d{7,14}$/;
const TWILIO_HEALTHY_ACCOUNT_STATUS = "active";
const DEFAULT_PROVIDER_HEALTH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function getTwilioConfigurationStatus(env: SmsEnv): TwilioConfigurationStatus {
  const values: Record<TwilioBindingName, string> = {
    TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID?.trim() || "",
    TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN?.trim() || "",
    TWILIO_FROM_NUMBER: env.TWILIO_FROM_NUMBER?.trim() || "",
  };
  const missingBindings = (Object.keys(values) as TwilioBindingName[]).filter(
    (binding) => !values[binding]
  );
  const invalidBindings: TwilioBindingName[] = [];

  if (values.TWILIO_ACCOUNT_SID && !TWILIO_ACCOUNT_SID_PATTERN.test(values.TWILIO_ACCOUNT_SID)) {
    invalidBindings.push("TWILIO_ACCOUNT_SID");
  }
  if (values.TWILIO_FROM_NUMBER && !E164_PHONE_NUMBER_PATTERN.test(values.TWILIO_FROM_NUMBER)) {
    invalidBindings.push("TWILIO_FROM_NUMBER");
  }

  return {
    valid: missingBindings.length === 0 && invalidBindings.length === 0,
    missingBindings,
    invalidBindings,
  };
}

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

export function parseSmsReply(body: string): SmsReplyType | null {
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

  if (OPT_IN_KEYWORDS.has(condensed) || OPT_IN_KEYWORDS.has(normalized)) {
    return "opt_in";
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

export function parseTwilioOptOutType(value: string | null): SmsReplyType | null {
  switch (value?.trim().toUpperCase()) {
    case "START":
      return "opt_in";
    case "STOP":
      return "opt_out";
    case "HELP":
      return "help";
    default:
      return null;
  }
}

export function parseTwilioMessageStatus(value: string | null): SmsDeliveryStatus | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized in SMS_STATUS_RANK
    ? (normalized as SmsDeliveryStatus)
    : null;
}

export function buildSmsReminderMessage({
  event,
  timeZone,
  rsvpStatus,
  now,
  customMessage,
  appBaseUrl,
}: {
  event: SmsEvent;
  timeZone: string;
  rsvpStatus?: string | null;
  now?: Date;
  customMessage?: string | null;
  appBaseUrl?: string;
}): string {
  const messageNow = now || new Date();
  const { dateLabel, timeLabel, relativeLabel } = formatEventDateTimeForSms(
    event,
    timeZone,
    messageNow
  );
  const statusLabel = formatRsvpStatus(rsvpStatus);
  const reminderText = `Reminder for ${relativeLabel ?? dateLabel} at ${timeLabel} at ${event.restaurant_name}.`;
  const messageBody = customMessage
    ? `${SMS_BRAND_PREFIX} ${customMessage.trim()} ${reminderText}`
    : `${SMS_BRAND_PREFIX} ${reminderText}`;
  const baseUrl = normalizeAppBaseUrl(appBaseUrl);
  const eventUrl = `${baseUrl}/dashboard?event=${event.id}#event-${event.id}`;
  const base = `${messageBody} Your RSVP: ${statusLabel}. Details: ${eventUrl}`;
  return appendSmsInstructions(base);
}

export async function sendSms({
  to,
  body,
  env,
  statusCallbackUrl,
}: {
  to: string;
  body: string;
  env: SmsEnv;
  statusCallbackUrl?: string;
}): Promise<SmsSendResult> {
  const configuration = getTwilioConfigurationStatus(env);
  if (!configuration.valid) {
    const missing = configuration.missingBindings.length > 0;
    const bindings = missing
      ? configuration.missingBindings
      : configuration.invalidBindings;
    return {
      success: false,
      error: `Twilio configuration ${missing ? "is missing" : "is invalid"}: ${bindings.join(", ")}.`,
      errorCode: missing ? "CONFIG_MISSING" : "CONFIG_INVALID",
    };
  }

  const accountSid = env.TWILIO_ACCOUNT_SID!.trim();
  const authToken = env.TWILIO_AUTH_TOKEN!.trim();
  const fromNumber = env.TWILIO_FROM_NUMBER!.trim();

  const params = new URLSearchParams();
  params.set("To", to);
  params.set("From", fromNumber);
  params.set("Body", body);
  if (statusCallbackUrl) {
    params.set("StatusCallback", statusCallbackUrl);
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(
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
  } catch {
    return {
      success: false,
      error: "Twilio could not be reached.",
      errorCode: "NETWORK_ERROR",
    };
  }

  const responseText = await response.text();
  const payload = parseTwilioResponse(responseText);

  if (!response.ok) {
    const errorCode = asOptionalString(payload.code);
    const error = asOptionalString(payload.message) || `Twilio request failed (${response.status}).`;
    return { success: false, error, errorCode };
  }

  const messageSid = asOptionalString(payload.sid);
  const status = parseTwilioMessageStatus(asOptionalString(payload.status) ?? null);
  if (!messageSid || !TWILIO_MESSAGE_SID_PATTERN.test(messageSid) || !status) {
    return { success: false, error: "Twilio returned an invalid message response." };
  }

  return { success: true, messageSid, status };
}

export async function checkTwilioProviderHealth({
  env,
  now = new Date(),
}: {
  env: SmsEnv;
  now?: Date;
}): Promise<SmsProviderHealth> {
  const checkedAt = now.toISOString();
  const configuration = getTwilioConfigurationStatus(env);
  if (!configuration.valid) {
    const errorCode = configuration.missingBindings.length > 0
      ? "CONFIG_MISSING"
      : "CONFIG_INVALID";
    logTwilioConfigurationError(configuration);
    return {
      status: "misconfigured",
      errorCode,
      checkedAt,
      lastHealthyAt: null,
    };
  }

  const accountSid = env.TWILIO_ACCOUNT_SID!.trim();
  const authToken = env.TWILIO_AUTH_TOKEN!.trim();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  let response: Response;

  try {
    response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      }
    );
  } catch {
    const health = createUnhealthyProviderResult("provider_error", "NETWORK_ERROR", checkedAt);
    logTwilioProviderHealthError(health);
    return health;
  }

  const payload = parseTwilioResponse(await response.text());
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403
      ? "authentication_failed"
      : "provider_error";
    const health = createUnhealthyProviderResult(
      status,
      asOptionalString(payload.code) || `HTTP_${response.status}`,
      checkedAt
    );
    logTwilioProviderHealthError(health);
    return health;
  }

  const accountStatus = asOptionalString(payload.status)?.toLowerCase();
  if (accountStatus === TWILIO_HEALTHY_ACCOUNT_STATUS) {
    return {
      status: "healthy",
      errorCode: null,
      checkedAt,
      lastHealthyAt: checkedAt,
    };
  }

  const status: SmsProviderHealthStatus = accountStatus === "suspended"
    ? "account_suspended"
    : accountStatus === "closed"
      ? "account_closed"
      : "provider_error";
  const health = createUnhealthyProviderResult(
    status,
    accountStatus ? `ACCOUNT_${accountStatus.toUpperCase()}` : "ACCOUNT_STATUS_MISSING",
    checkedAt
  );
  logTwilioProviderHealthError(health);
  return health;
}

export async function getSmsProviderHealth(db: D1Database): Promise<SmsProviderHealth | null> {
  const row = await db
    .prepare(`
      SELECT status, error_code, checked_at, last_healthy_at
      FROM sms_provider_health
      WHERE provider = 'twilio'
    `)
    .first() as
    | {
        status: SmsProviderHealthStatus;
        error_code: string | null;
        checked_at: string;
        last_healthy_at: string | null;
      }
    | null;

  if (!row) {
    return null;
  }

  return {
    status: row.status,
    errorCode: row.error_code,
    checkedAt: row.checked_at,
    lastHealthyAt: row.last_healthy_at,
  };
}

export async function recordSmsProviderHealth({
  db,
  health,
}: {
  db: D1Database;
  health: SmsProviderHealth;
}): Promise<void> {
  await db
    .prepare(`
      INSERT INTO sms_provider_health (
        provider, status, error_code, checked_at, last_healthy_at
      ) VALUES ('twilio', ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        status = excluded.status,
        error_code = excluded.error_code,
        checked_at = excluded.checked_at,
        last_healthy_at = CASE
          WHEN excluded.status = 'healthy' THEN excluded.checked_at
          ELSE sms_provider_health.last_healthy_at
        END
    `)
    .bind(
      health.status,
      health.errorCode,
      health.checkedAt,
      health.status === "healthy" ? health.checkedAt : health.lastHealthyAt
    )
    .run();
}

export function isSmsProviderHealthFresh(
  health: SmsProviderHealth | null,
  now = new Date(),
  maximumAgeMs = DEFAULT_PROVIDER_HEALTH_INTERVAL_MS
): boolean {
  if (!health) {
    return false;
  }

  const checkedAt = new Date(health.checkedAt).getTime();
  return Number.isFinite(checkedAt) && now.getTime() - checkedAt <= maximumAgeMs;
}

export async function maybeCheckTwilioProviderHealth({
  db,
  env,
  now = new Date(),
  minimumIntervalMs = DEFAULT_PROVIDER_HEALTH_INTERVAL_MS,
}: {
  db: D1Database;
  env: SmsEnv;
  now?: Date;
  minimumIntervalMs?: number;
}): Promise<SmsProviderHealth> {
  const stored = await getSmsProviderHealth(db);
  if (isSmsProviderHealthFresh(stored, now, minimumIntervalMs)) {
    return stored!;
  }

  const checked = await checkTwilioProviderHealth({ env, now });
  await recordSmsProviderHealth({ db, health: checked });
  return {
    ...checked,
    lastHealthyAt: checked.status === "healthy"
      ? checked.checkedAt
      : stored?.lastHealthyAt || null,
  };
}

export async function recordSmsDeliveryStatus({
  db,
  deliveryId,
  messageSid,
  status,
  errorCode,
}: {
  db: D1Database;
  deliveryId: string;
  messageSid?: string | null;
  status: SmsDeliveryStatus;
  errorCode?: string | null;
}): Promise<boolean> {
  const result = await db
    .prepare(`
      UPDATE sms_deliveries
      SET provider_message_sid = COALESCE(provider_message_sid, ?),
          status = ?,
          status_rank = ?,
          error_code = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND (provider_message_sid IS NULL OR provider_message_sid = ?)
        AND (
          status_rank < ?
          OR (status_rank = ? AND status = ?)
        )
    `)
    .bind(
      messageSid || null,
      status,
      SMS_STATUS_RANK[status],
      errorCode || null,
      deliveryId,
      messageSid || null,
      SMS_STATUS_RANK[status],
      SMS_STATUS_RANK[status],
      status
    )
    .run();

  return Number(result?.meta?.changes ?? 0) > 0;
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
  const configuration = getTwilioConfigurationStatus(env);
  if (!configuration.valid) {
    logTwilioConfigurationError(configuration);
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
  // The cron runs every 15 minutes. A 30-minute lookback tolerates one delayed
  // or missed invocation, while the sms_reminders uniqueness check prevents
  // duplicate delivery during the overlapping windows.
  const windowMs = 30 * 60 * 1000;

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

      for (const recipient of (recipients.results || []) as SmsRecipientRow[]) {
        const to = recipient.phone_number;
        const rsvpStatus = recipient.rsvp_status;
        const body = buildSmsReminderMessage({
          event,
          timeZone,
          rsvpStatus,
          now,
          appBaseUrl: env.APP_BASE_URL,
        });
        const result = await sendTrackedSms({
          db,
          env,
          eventId: event.id,
          userId: recipient.id,
          reminderType: target.type,
          to,
          body,
        });
        if (result.success) {
          await recordAcceptedReminder(db, event.id, recipient.id, target.type);
        } else {
          logErrorEvent("sms_reminder_failed");
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

  const configuration = getTwilioConfigurationStatus(env);
  if (!configuration.valid) {
    logTwilioConfigurationError(configuration);
  }

  const reminderType = `adhoc:${crypto.randomUUID()}`;
  let sent = 0;
  const errors: string[] = [];

  for (const recipient of (recipients.results || []) as SmsRecipientRow[]) {
    const to = recipient.phone_number;
    const rsvpStatus = recipient.rsvp_status;
    const message = buildSmsReminderMessage({
      event,
      timeZone,
      rsvpStatus,
      customMessage,
      appBaseUrl: env.APP_BASE_URL,
    });
    const result = await sendTrackedSms({
      db,
      env,
      eventId: event.id,
      userId: recipient.id,
      reminderType,
      to,
      body: message,
    });
    if (result.success) {
      sent += 1;
      await recordAcceptedReminder(db, event.id, recipient.id, reminderType);
    } else {
      errors.push(`Member ${recipient.id}: ${result.error}`);
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

function isWithinWindow(diffMs: number, targetMs: number, windowMs: number): boolean {
  return diffMs <= targetMs && diffMs > targetMs - windowMs;
}

function appendSmsInstructions(message: string): string {
  return `${message} Reply YES or NO to RSVP. Reply HELP for help. Reply STOP to opt out.`;
}

async function sendTrackedSms({
  db,
  env,
  eventId,
  userId,
  reminderType,
  to,
  body,
}: {
  db: D1Database;
  env: SmsEnv;
  eventId: number;
  userId: number;
  reminderType: string;
  to: string;
  body: string;
}): Promise<SmsSendResult> {
  const deliveryId = crypto.randomUUID();
  await db
    .prepare(`
      INSERT INTO sms_deliveries (
        id, event_id, user_id, reminder_type, status, status_rank
      ) VALUES (?, ?, ?, ?, 'creating', 0)
    `)
    .bind(deliveryId, eventId, userId, reminderType)
    .run();

  const callbackUrl = new URL("/api/webhooks/sms-status", normalizeAppBaseUrl(env.APP_BASE_URL));
  callbackUrl.searchParams.set("delivery_id", deliveryId);
  const result = await sendSms({
    to,
    body,
    env,
    statusCallbackUrl: callbackUrl.toString(),
  });

  if (result.success) {
    await recordSmsDeliveryStatus({
      db,
      deliveryId,
      messageSid: result.messageSid,
      status: result.status,
    });
    return result;
  }

  await recordSmsDeliveryStatus({
    db,
    deliveryId,
    status: "failed",
    errorCode: result.errorCode,
  });
  return result;
}

async function recordAcceptedReminder(
  db: D1Database,
  eventId: number,
  userId: number,
  reminderType: string
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO sms_reminders (event_id, user_id, reminder_type) VALUES (?, ?, ?)"
    )
    .bind(eventId, userId, reminderType)
    .run();
}

function normalizeAppBaseUrl(value?: string): string {
  return (value?.trim() || "https://meatup.club").replace(/\/$/, "");
}

function parseTwilioResponse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function createUnhealthyProviderResult(
  status: Exclude<SmsProviderHealthStatus, "healthy">,
  errorCode: string,
  checkedAt: string
): SmsProviderHealth {
  return {
    status,
    errorCode,
    checkedAt,
    lastHealthyAt: null,
  };
}

function logTwilioConfigurationError(configuration: TwilioConfigurationStatus): void {
  console.error({
    event: "twilio_configuration_error",
    missingBindings: configuration.missingBindings,
    invalidBindings: configuration.invalidBindings,
  });
}

function logTwilioProviderHealthError(health: SmsProviderHealth): void {
  console.error({
    event: "twilio_provider_unhealthy",
    status: health.status,
    errorCode: health.errorCode,
  });
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
