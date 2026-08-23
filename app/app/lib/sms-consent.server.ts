import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

export const SMS_CONSENT_DISCLOSURE_VERSION = "sms-reminders-2026-08-22";

export type SmsConsentEventType = "opt_in" | "opt_out";
export type SmsConsentSource = "profile" | "sms";

export function prepareSmsConsentEvent(
  db: D1Database,
  {
    userId,
    phoneNumber,
    eventType,
    source,
    providerMessageSid = null,
  }: {
    userId: number;
    phoneNumber: string;
    eventType: SmsConsentEventType;
    source: SmsConsentSource;
    providerMessageSid?: string | null;
  }
): D1PreparedStatement {
  return db
    .prepare(`
      INSERT OR IGNORE INTO sms_consent_events (
        user_id,
        phone_number,
        event_type,
        source,
        disclosure_version,
        provider_message_sid
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      phoneNumber,
      eventType,
      source,
      SMS_CONSENT_DISCLOSURE_VERSION,
      providerMessageSid
    );
}
