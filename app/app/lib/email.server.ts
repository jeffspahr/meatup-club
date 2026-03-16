// Email sending utilities using Resend

import { renderAnnouncementMessageHtml } from "./announcement-markdown.server";

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface SendInviteEmailParams {
  to: string;
  inviteeName: string | null;
  inviterName: string;
  acceptLink: string;
  resendApiKey: string;
  template: EmailTemplate;
}

interface SendAnnouncementEmailsParams {
  recipientEmails: string[];
  subject: string;
  messageText: string;
  resendApiKey: string;
  senderName?: string;
  idempotencyKey?: string;
}

const RESEND_BATCH_SEND_LIMIT = 100;

function replaceVariables(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "redacted";
  }

  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}***@${domain}`;
}

function logResendFailure(operation: string, response: Response) {
  const headers = response.headers;
  console.error(`${operation} failed`, {
    status: response.status,
    statusText: response.statusText,
    retryAfter: headers?.get("retry-after") ?? null,
    rateLimitRemaining: headers?.get("ratelimit-remaining") ?? null,
    rateLimitReset: headers?.get("ratelimit-reset") ?? null,
  });
}

type ResendDeliveryResult =
  | { success: true; providerMessageId: string }
  | { success: false; error: string; retryable: boolean; retryAfterSeconds?: number };

function parseRetryDelaySeconds(response: Response): number | undefined {
  const retryAfter = response.headers?.get("retry-after")?.trim();
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.ceil(retryAfterSeconds);
    }

    const retryAt = Date.parse(retryAfter);
    if (!Number.isNaN(retryAt)) {
      return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    }
  }

  const rateLimitReset = response.headers?.get("ratelimit-reset")?.trim();
  if (!rateLimitReset) {
    return undefined;
  }

  const rateLimitResetSeconds = Number(rateLimitReset);
  if (!Number.isFinite(rateLimitResetSeconds) || rateLimitResetSeconds < 0) {
    return undefined;
  }

  return Math.ceil(rateLimitResetSeconds);
}

function toLegacySendResult(
  result: ResendDeliveryResult
): { success: boolean; error?: string } {
  if (result.success) {
    return { success: true };
  }

  return {
    success: false,
    error: result.error,
  };
}

function isRetryableResponseStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sendResendEmailRequest(params: {
  operation: string;
  resendApiKey: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  recipientForLog?: string;
  eventId?: number;
}): Promise<ResendDeliveryResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.resendApiKey}`,
        "Content-Type": "application/json",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
      },
      body: JSON.stringify(params.payload),
    });

    if (!response.ok) {
      logResendFailure(params.operation, response);
      return {
        success: false,
        error: `Failed to send email: ${response.statusText}`,
        retryable: isRetryableResponseStatus(response.status),
        retryAfterSeconds: parseRetryDelaySeconds(response),
      };
    }

    const data = (await response.json()) as { id?: string };
    if (!data.id) {
      return {
        success: false,
        error: "Resend accepted the request without returning an email id",
        retryable: true,
      };
    }

    return { success: true, providerMessageId: data.id };
  } catch (error) {
    console.error(`${params.operation} failed`, {
      eventId: params.eventId,
      recipient: params.recipientForLog ? redactEmail(params.recipientForLog) : undefined,
      message: getErrorMessage(error),
    });
    return {
      success: false,
      error: getErrorMessage(error),
      retryable: true,
    };
  }
}

export async function sendAnnouncementEmails({
  recipientEmails,
  subject,
  messageText,
  resendApiKey,
  senderName = "MeatUp.Club",
  idempotencyKey,
}: SendAnnouncementEmailsParams): Promise<{ success: boolean; sentCount: number; error?: string }> {
  const uniqueRecipients = Array.from(
    new Set(recipientEmails.map((email) => email.trim()).filter(Boolean))
  );
  if (uniqueRecipients.length === 0) {
    return { success: true, sentCount: 0 };
  }

  const html = renderAnnouncementMessageHtml(messageText);
  const entityRefId = `announcement-${Date.now()}`;
  let sentCount = 0;

  try {
    for (let index = 0; index < uniqueRecipients.length; index += RESEND_BATCH_SEND_LIMIT) {
      const recipientBatch = uniqueRecipients.slice(index, index + RESEND_BATCH_SEND_LIMIT);
      const batchNumber = Math.floor(index / RESEND_BATCH_SEND_LIMIT);
      const response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": `${idempotencyKey}:${batchNumber}` } : {}),
        },
        body: JSON.stringify(
          recipientBatch.map((email) => ({
            from: `${senderName} <notifications@mail.meatup.club>`,
            to: [email],
            subject,
            html,
            text: messageText,
            reply_to: "noreply@meatup.club",
            headers: {
              "X-Entity-Ref-ID": entityRefId,
            },
            tags: [
              {
                name: "category",
                value: "member_announcement",
              },
            ],
          }))
        ),
      });

      if (!response.ok) {
        logResendFailure("Member announcement batch email", response);
        return {
          success: false,
          sentCount,
          error: `Failed to send announcement email: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as
        | { data?: Array<{ id?: string }> }
        | Array<{ id?: string }>;
      const accepted = Array.isArray(data) ? data : data.data || [];
      if (accepted.length !== recipientBatch.length) {
        return {
          success: false,
          sentCount,
          error: "Resend accepted the batch without returning all email ids",
        };
      }

      sentCount += accepted.length;
    }

    return { success: true, sentCount };
  } catch (error) {
    console.error("Member announcement batch email failed", {
      recipientCount: uniqueRecipients.length,
      message: getErrorMessage(error),
    });
    return {
      success: false,
      sentCount,
      error: "Failed to send announcement email",
    };
  }
}

export async function sendInviteEmail({
  to,
  inviteeName,
  inviterName,
  acceptLink,
  resendApiKey,
  template,
}: SendInviteEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    // Replace template variables
    const variables = {
      inviteeName: inviteeName || 'there',
      inviterName,
      acceptLink,
    };

    const subject = replaceVariables(template.subject, variables);
    const html = replaceVariables(template.html, variables);
    const text = replaceVariables(template.text, variables);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Meatup.Club <invites@mail.meatup.club>',
        to: [to],
        subject,
        html,
        text,
        reply_to: 'noreply@meatup.club',
        headers: {
          'X-Entity-Ref-ID': `invite-${Date.now()}`,
        },
        tags: [
          {
            name: 'category',
            value: 'invite',
          },
        ],
      }),
    });

    if (!response.ok) {
      logResendFailure('Invite email', response);
      return { success: false, error: `Failed to send email: ${response.statusText}` };
    }

    await response.json();
    return { success: true };
  } catch (error) {
    console.error('Invite email send failed', { message: getErrorMessage(error) });
    return { success: false, error: 'Failed to send invitation email' };
  }
}

interface SendCommentReplyParams {
  to: string;
  recipientName: string | null;
  replierName: string;
  originalComment: string;
  replyContent: string;
  pollUrl: string;
  resendApiKey: string;
}

export async function sendCommentReplyEmail({
  to,
  recipientName,
  replierName,
  originalComment,
  replyContent,
  pollUrl,
  resendApiKey,
}: SendCommentReplyParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { generateCommentReplyEmail } = await import('./email-templates');

    const { subject, html, text } = generateCommentReplyEmail({
      recipientName,
      replierName,
      originalComment,
      replyContent,
      pollUrl,
    });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Meatup.Club <notifications@mail.meatup.club>',
        to: [to],
        subject,
        html,
        text,
        reply_to: 'noreply@meatup.club',
        headers: {
          'X-Entity-Ref-ID': `comment-reply-${Date.now()}`,
        },
        tags: [
          {
            name: 'category',
            value: 'comment_reply',
          },
        ],
      }),
    });

    if (!response.ok) {
      logResendFailure('Comment reply email', response);
      return { success: false, error: `Failed to send email: ${response.statusText}` };
    }

    await response.json();
    return { success: true };
  } catch (error) {
    console.error('Comment reply email send failed', { message: getErrorMessage(error) });
    return { success: false, error: 'Failed to send comment reply notification' };
  }
}

interface SendRsvpOverrideEmailParams {
  to: string;
  recipientName: string | null;
  adminName: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  rsvpStatus: string;
  eventUrl: string;
  resendApiKey: string;
}

export async function sendRsvpOverrideEmail({
  to,
  recipientName,
  adminName,
  eventName,
  eventDate,
  eventTime,
  rsvpStatus,
  eventUrl,
  resendApiKey,
}: SendRsvpOverrideEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { generateRsvpOverrideEmail } = await import('./email-templates');

    const { subject, html, text } = generateRsvpOverrideEmail({
      recipientName,
      adminName,
      eventName,
      eventDate,
      eventTime,
      rsvpStatus,
      eventUrl,
    });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Meatup.Club <notifications@mail.meatup.club>',
        to: [to],
        subject,
        html,
        text,
        reply_to: 'noreply@meatup.club',
        headers: {
          'X-Entity-Ref-ID': `rsvp-override-${Date.now()}`,
        },
        tags: [
          {
            name: 'category',
            value: 'rsvp_override',
          },
        ],
      }),
    });

    if (!response.ok) {
      logResendFailure('RSVP override email', response);
      return { success: false, error: `Failed to send email: ${response.statusText}` };
    }

    await response.json();
    return { success: true };
  } catch (error) {
    console.error('RSVP override email send failed', { message: getErrorMessage(error) });
    return { success: false, error: 'Failed to send RSVP override notification' };
  }
}

interface EventInviteParams {
  eventId: number;
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string; // YYYY-MM-DD format
  eventTime?: string; // HH:MM format (24-hour), defaults to 18:00
  recipientEmails: string[];
  resendApiKey: string;
}

interface EventInviteEmailParams {
  eventId: number;
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime?: string;
  userEmail: string;
  rsvpStatus?: 'yes' | 'no' | 'maybe';
  resendApiKey: string;
  idempotencyKey?: string;
}

const EVENT_INVITE_SEND_CONCURRENCY = 6;

function getCalendarPartstatForRsvpStatus(
  rsvpStatus?: 'yes' | 'no' | 'maybe' | null
): string {
  const partstatMap: Record<string, string> = {
    yes: 'ACCEPTED',
    no: 'DECLINED',
    maybe: 'TENTATIVE',
  };

  return rsvpStatus ? partstatMap[rsvpStatus] || 'NEEDS-ACTION' : 'NEEDS-ACTION';
}

/**
 * Generate an iCalendar (.ics) file content for an event
 * Exported for testing
 */
export function generateCalendarInvite({
  eventId,
  restaurantName,
  restaurantAddress,
  eventDate,
  eventTime = '18:00',
  attendeeEmail,
  rsvpStatus,
  sequence = 0,
}: {
  eventId: number;
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime?: string;
  attendeeEmail: string;
  rsvpStatus?: 'yes' | 'no' | 'maybe';
  sequence?: number;
}): string {
  // Parse the date and time
  const [year, month, day] = eventDate.split('-').map(Number);
  const [hours, minutes] = eventTime.split(':').map(Number);

  // Create start date/time (local time)
  const startDate = new Date(year, month - 1, day, hours, minutes);

  // Event duration: 2 hours
  const endDate = new Date(startDate);
  endDate.setHours(startDate.getHours() + 2);

  // Format dates for iCalendar (YYYYMMDDTHHmmss)
  const formatICalDate = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  };

  const dtStart = formatICalDate(startDate);
  const dtEnd = formatICalDate(endDate);
  const dtStamp = formatICalDate(new Date());

  // Create stable unique identifier (no timestamp so updates match)
  const uid = `event-${eventId}@meatup.club`;

  // Build location string
  const location = restaurantAddress
    ? `${restaurantName}, ${restaurantAddress}`
    : restaurantName;

  // Build description
  const description = `Join us for our quarterly meatup at ${restaurantName}!${restaurantAddress ? `\\n\\nLocation: ${restaurantAddress}` : ''}\\n\\nRSVP and view details at https://meatup.club/dashboard/events`;
  const partstat = getCalendarPartstatForRsvpStatus(rsvpStatus);

  // Generate iCalendar content (RFC 5545 format)
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meatup.Club//Event Invite//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Meatup.Club - ${restaurantName}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    `SEQUENCE:${sequence}`,
    'ORGANIZER;CN=Meatup.Club:mailto:rsvp@mail.meatup.club',
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${partstat};RSVP=TRUE;CN=${attendeeEmail}:mailto:${attendeeEmail}`,
    'CLASS:PUBLIC',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: Meatup at ${restaurantName} tomorrow`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return icsContent;
}

/**
 * Send calendar invite emails to all recipients
 */
export async function sendEventInviteEmail({
  eventId,
  restaurantName,
  restaurantAddress,
  eventDate,
  eventTime = "18:00",
  userEmail,
  rsvpStatus,
  resendApiKey,
  idempotencyKey,
}: EventInviteEmailParams): Promise<ResendDeliveryResult> {
  const personalizedIcsContent = generateCalendarInvite({
    eventId,
    restaurantName,
    restaurantAddress,
    eventDate,
    eventTime,
    attendeeEmail: userEmail,
    rsvpStatus,
    sequence: 0,
  });

  const personalizedIcsBase64 = Buffer.from(personalizedIcsContent).toString("base64");
  const isPollDefaultAccepted = rsvpStatus === "yes";
  const rsvpCopy = isPollDefaultAccepted
    ? `
                      <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
                        You're currently marked in because you voted that this date works for you in the poll. You can change your RSVP on Meatup.Club or in your calendar any time.
                      </p>
                    `
    : "";
  const rsvpText = isPollDefaultAccepted
    ? "\nYou're currently marked in because you voted that this date works for you in the poll. You can change your RSVP any time.\n"
    : "";

  return sendResendEmailRequest({
    operation: "Calendar invite email",
    resendApiKey,
    idempotencyKey,
    recipientForLog: userEmail,
    eventId,
    payload: {
      from: "Meatup.Club Events <events@mail.meatup.club>",
      to: [userEmail],
      subject: `📅 Save the Date: Meatup at ${restaurantName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px; text-align: center; background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); border-radius: 8px 8px 0 0;">
                      <h1 style="margin: 0; font-size: 28px; color: #ffffff;">🥩 Meatup.Club</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px;">
                      <h2 style="margin: 0 0 20px; font-size: 24px; color: #1f2937;">Save the Date!</h2>
                      <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
                        You're invited to our next quarterly meatup!
                      </p>
                      <div style="background-color: #fef2f2; border-left: 4px solid #991b1b; padding: 20px; margin: 0 0 24px; border-radius: 4px;">
                        <p style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #991b1b;">📍 ${restaurantName}</p>
                        ${restaurantAddress ? `<p style="margin: 0 0 12px; font-size: 14px; color: #4b5563;">${restaurantAddress}</p>` : ""}
                        <p style="margin: 0; font-size: 16px; color: #1f2937;">📅 ${new Date(eventDate + "T" + eventTime).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${new Date("2000-01-01T" + eventTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
                      </div>
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td align="center" style="padding: 0 0 24px;">
                            <a href="https://meatup.club/dashboard/events" style="display: inline-block; background-color: #991b1b; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(153, 27, 27, 0.2);">
                              RSVP Now
                            </a>
                          </td>
                        </tr>
                      </table>
                      ${rsvpCopy}
                      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                        A calendar invite is attached to this email. Add it to your calendar so you don't miss it!
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                      <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
                        Meatup.Club - Your Quarterly Steakhouse Society
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `
🥩 Meatup.Club - Save the Date!

You're invited to our next quarterly meatup!

📍 ${restaurantName}
${restaurantAddress ? restaurantAddress + "\n" : ""}📅 ${new Date(eventDate + "T" + eventTime).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${new Date("2000-01-01T" + eventTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}

RSVP at: https://meatup.club/dashboard/events
${rsvpText}

A calendar invite is attached to this email.
      `,
      reply_to: "rsvp@mail.meatup.club",
      attachments: [
        {
          filename: "event.ics",
          content: personalizedIcsBase64,
          content_type: "text/calendar; method=REQUEST",
        },
      ],
      headers: {
        "X-Entity-Ref-ID": `event-${eventId}-${crypto.randomUUID()}`,
      },
      tags: [
        {
          name: "category",
          value: "event_invite",
        },
      ],
    },
  });
}

export async function sendEventInvites({
  eventId,
  restaurantName,
  restaurantAddress,
  eventDate,
  eventTime = '18:00',
  recipientEmails,
  resendApiKey,
}: EventInviteParams): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
  if (recipientEmails.length === 0) {
    return { success: true, sentCount: 0, errors: [] };
  }

  const errors: string[] = [];
  let sentCount = 0;

  async function sendInviteToRecipient(email: string): Promise<void> {
    const result = await sendEventInviteEmail({
      eventId,
      restaurantName,
      restaurantAddress,
      eventDate,
      eventTime,
      userEmail: email,
      resendApiKey,
    });
    if (result.success) {
      sentCount++;
      return;
    }

    errors.push(`${redactEmail(email)}: ${result.error}`);
  }

  const workerCount = Math.min(EVENT_INVITE_SEND_CONCURRENCY, recipientEmails.length);
  let nextRecipientIndex = 0;

  // Bound invite concurrency so the background job finishes quickly without
  // opening an unbounded number of outbound requests in Workers.
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextRecipientIndex < recipientEmails.length) {
        const email = recipientEmails[nextRecipientIndex];
        nextRecipientIndex += 1;
        if (!email) {
          continue;
        }

        await sendInviteToRecipient(email);
      }
    })
  );

  return {
    success: errors.length === 0,
    sentCount,
    errors,
  };
}

interface CalendarUpdateParams {
  eventId: number;
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime: string;
  userEmail: string;
  rsvpStatus: 'yes' | 'no' | 'maybe';
  resendApiKey: string;
}

/**
 * Send a calendar update when a user changes their RSVP on the website
 * This updates their calendar event to reflect their new response
 */
export async function sendCalendarUpdate({
  eventId,
  restaurantName,
  restaurantAddress,
  eventDate,
  eventTime,
  userEmail,
  rsvpStatus,
  resendApiKey,
}: CalendarUpdateParams): Promise<{ success: boolean; error?: string }> {
  try {
    // Parse the date and time
    const [year, month, day] = eventDate.split('-').map(Number);
    const [hours, minutes] = eventTime.split(':').map(Number);

    // Create start date/time (local time)
    const startDate = new Date(year, month - 1, day, hours, minutes);

    // Event duration: 2 hours
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 2);

    // Format dates for iCalendar
    const formatICalDate = (date: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    };

    const dtStart = formatICalDate(startDate);
    const dtEnd = formatICalDate(endDate);
    const dtStamp = formatICalDate(new Date());

    // Use a stable UID based on eventId (not timestamp) so it matches the original invite
    const uid = `event-${eventId}@meatup.club`;

    const location = restaurantAddress
      ? `${restaurantName}, ${restaurantAddress}`
      : restaurantName;

    const description = `Join us for our quarterly meatup at ${restaurantName}!${restaurantAddress ? `\\n\\nLocation: ${restaurantAddress}` : ''}\\n\\nRSVP and view details at https://meatup.club/dashboard/events`;

    // Map website RSVP status to calendar PARTSTAT
    const partstat = getCalendarPartstatForRsvpStatus(rsvpStatus);

    // Generate updated calendar content
    // SEQUENCE:1 indicates this is an update to the original event
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Meatup.Club//Event Update//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:Meatup.Club - ${restaurantName}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:1',
      'ORGANIZER;CN=Meatup.Club:mailto:rsvp@mail.meatup.club',
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${partstat};RSVP=TRUE;CN=${userEmail}:mailto:${userEmail}`,
      'CLASS:PUBLIC',
      'TRANSP:OPAQUE',
      'BEGIN:VALARM',
      'TRIGGER:-PT24H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: Meatup at ${restaurantName} tomorrow`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const icsBase64 = Buffer.from(icsContent).toString('base64');

    // Map RSVP status to friendly text
    const statusText: Record<string, string> = {
      'yes': 'accepted',
      'no': 'declined',
      'maybe': 'tentatively accepted',
    };

    const statusVerb = statusText[rsvpStatus] || 'updated';

    // Send update email
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Meatup.Club Events <events@mail.meatup.club>',
        to: [userEmail],
        subject: `RSVP Updated: ${restaurantName}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 40px 0;">
                  <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <tr>
                      <td style="padding: 40px; text-align: center; background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">🥩 Meatup.Club</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px;">
                        <h2 style="margin: 0 0 20px; font-size: 24px; color: #1f2937;">RSVP Updated</h2>
                        <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
                          You've ${statusVerb} the invitation to our meatup at ${restaurantName}.
                        </p>
                        <div style="background-color: #fef2f2; border-left: 4px solid #991b1b; padding: 20px; margin: 0 0 24px; border-radius: 4px;">
                          <p style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #991b1b;">📍 ${restaurantName}</p>
                          ${restaurantAddress ? `<p style="margin: 0 0 12px; font-size: 14px; color: #4b5563;">${restaurantAddress}</p>` : ''}
                          <p style="margin: 0; font-size: 16px; color: #1f2937;">📅 ${new Date(eventDate + 'T' + eventTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date('2000-01-01T' + eventTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                        </div>
                        <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                          An updated calendar invite is attached. It will update the existing event in your calendar with your new RSVP status.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
                          Meatup.Club - Your Quarterly Steakhouse Society
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
        text: `
🥩 Meatup.Club - RSVP Updated

You've ${statusVerb} the invitation to our meatup.

📍 ${restaurantName}
${restaurantAddress ? restaurantAddress + '\n' : ''}📅 ${new Date(eventDate + 'T' + eventTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date('2000-01-01T' + eventTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}

An updated calendar invite is attached. It will update the existing event in your calendar.
        `,
        reply_to: 'rsvp@mail.meatup.club',
        attachments: [
          {
            filename: 'event-update.ics',
            content: icsBase64,
            content_type: 'text/calendar; method=REQUEST',
          },
        ],
        headers: {
          'X-Entity-Ref-ID': `event-update-${eventId}-${Date.now()}`,
        },
        tags: [
          {
            name: 'category',
            value: 'calendar_update',
          },
        ],
      }),
    });

    if (!response.ok) {
      logResendFailure('Calendar RSVP update email', response);
      return { success: false, error: `Failed to send update: ${response.statusText}` };
    }

    return { success: true };
  } catch (error) {
    console.error('Calendar RSVP update email failed', {
      eventId,
      recipient: redactEmail(userEmail),
      message: getErrorMessage(error),
    });
    return { success: false, error: getErrorMessage(error) };
  }
}

interface EventUpdateParams {
  eventId: number;
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime: string;
  userEmail: string;
  rsvpStatus?: 'yes' | 'no' | 'maybe';
  sequence: number;
  resendApiKey: string;
  idempotencyKey?: string;
}

/**
 * Send a calendar update when an event changes (date/time/location)
 * This updates the existing calendar invite for each member.
 */
export async function sendEventUpdateEmail({
  eventId,
  restaurantName,
  restaurantAddress,
  eventDate,
  eventTime,
  userEmail,
  rsvpStatus,
  sequence,
  resendApiKey,
  idempotencyKey,
}: EventUpdateParams): Promise<ResendDeliveryResult> {
  try {
    const [year, month, day] = eventDate.split('-').map(Number);
    const [hours, minutes] = eventTime.split(':').map(Number);

    const startDate = new Date(year, month - 1, day, hours, minutes);
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 2);

    const formatICalDate = (date: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    };

    const dtStart = formatICalDate(startDate);
    const dtEnd = formatICalDate(endDate);
    const dtStamp = formatICalDate(new Date());

    const uid = `event-${eventId}@meatup.club`;

    const location = restaurantAddress
      ? `${restaurantName}, ${restaurantAddress}`
      : restaurantName;

    const description = `Join us for our quarterly meatup at ${restaurantName}!${restaurantAddress ? `\\n\\nLocation: ${restaurantAddress}` : ''}\\n\\nRSVP and view details at https://meatup.club/dashboard/events`;

    const partstat = getCalendarPartstatForRsvpStatus(rsvpStatus);

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Meatup.Club//Event Update//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:Meatup.Club - ${restaurantName}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      `SEQUENCE:${sequence}`,
      'ORGANIZER;CN=Meatup.Club:mailto:rsvp@mail.meatup.club',
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${partstat};RSVP=TRUE;CN=${userEmail}:mailto:${userEmail}`,
      'CLASS:PUBLIC',
      'TRANSP:OPAQUE',
      'BEGIN:VALARM',
      'TRIGGER:-PT24H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: Meatup at ${restaurantName} tomorrow`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const icsBase64 = Buffer.from(icsContent).toString('base64');

    return await sendResendEmailRequest({
      operation: "Event update email",
      resendApiKey,
      idempotencyKey,
      recipientForLog: userEmail,
      eventId,
      payload: {
        from: 'Meatup.Club Events <events@mail.meatup.club>',
        to: [userEmail],
        subject: `Event Updated: ${restaurantName}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 40px 0;">
                  <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <tr>
                      <td style="padding: 40px; text-align: center; background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">🥩 Meatup.Club</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px;">
                        <h2 style="margin: 0 0 20px; font-size: 24px; color: #1f2937;">Event Updated</h2>
                        <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
                          The event details have changed. Your calendar invite has been updated.
                        </p>
                        <div style="background-color: #fef2f2; border-left: 4px solid #991b1b; padding: 20px; margin: 0 0 24px; border-radius: 4px;">
                          <p style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #991b1b;">📍 ${restaurantName}</p>
                          ${restaurantAddress ? `<p style="margin: 0 0 12px; font-size: 14px; color: #4b5563;">${restaurantAddress}</p>` : ''}
                          <p style="margin: 0; font-size: 16px; color: #1f2937;">📅 ${new Date(eventDate + 'T' + eventTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date('2000-01-01T' + eventTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                        </div>
                        <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                          An updated calendar invite is attached. It will update the existing event in your calendar.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
                          Meatup.Club - Your Quarterly Steakhouse Society
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
        text: `
🥩 Meatup.Club - Event Updated

The event details have changed.

📍 ${restaurantName}
${restaurantAddress ? restaurantAddress + '\n' : ''}📅 ${new Date(eventDate + 'T' + eventTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date('2000-01-01T' + eventTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}

An updated calendar invite is attached. It will update the existing event in your calendar.
        `,
        reply_to: 'rsvp@mail.meatup.club',
        attachments: [
          {
            filename: 'event-update.ics',
            content: icsBase64,
            content_type: 'text/calendar; method=REQUEST',
          },
        ],
        headers: {
          'X-Entity-Ref-ID': `event-update-${eventId}-${Date.now()}`,
        },
        tags: [
          {
            name: 'category',
            value: 'event_update',
          },
        ],
      },
    });
  } catch (error) {
    console.error('Event update email failed', {
      eventId,
      recipient: redactEmail(userEmail),
      message: getErrorMessage(error),
    });
    return { success: false, error: getErrorMessage(error), retryable: true };
  }
}

export async function sendEventUpdate(
  params: EventUpdateParams
): Promise<{ success: boolean; error?: string }> {
  return toLegacySendResult(await sendEventUpdateEmail(params));
}

interface EventCancellationParams {
  eventId: number;
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime: string;
  userEmail: string;
  sequence: number;
  resendApiKey: string;
  idempotencyKey?: string;
}

/**
 * Send a calendar cancellation when an event is deleted.
 * This removes the existing event from the user's calendar.
 */
export async function sendEventCancellationEmail({
  eventId,
  restaurantName,
  restaurantAddress,
  eventDate,
  eventTime,
  userEmail,
  sequence,
  resendApiKey,
  idempotencyKey,
}: EventCancellationParams): Promise<ResendDeliveryResult> {
  try {
    const [year, month, day] = eventDate.split('-').map(Number);
    const [hours, minutes] = eventTime.split(':').map(Number);

    const startDate = new Date(year, month - 1, day, hours, minutes);
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 2);

    const formatICalDate = (date: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    };

    const dtStart = formatICalDate(startDate);
    const dtEnd = formatICalDate(endDate);
    const dtStamp = formatICalDate(new Date());

    const uid = `event-${eventId}@meatup.club`;

    const location = restaurantAddress
      ? `${restaurantName}, ${restaurantAddress}`
      : restaurantName;

    const description = `This event has been cancelled. Please ignore the previous invite.`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Meatup.Club//Event Cancel//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:CANCEL',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:Meatup.Club - ${restaurantName}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'STATUS:CANCELLED',
      `SEQUENCE:${sequence}`,
      'ORGANIZER;CN=Meatup.Club:mailto:rsvp@mail.meatup.club',
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=DECLINED;CN=${userEmail}:mailto:${userEmail}`,
      'CLASS:PUBLIC',
      'TRANSP:OPAQUE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const icsBase64 = Buffer.from(icsContent).toString('base64');

    return await sendResendEmailRequest({
      operation: "Event cancellation email",
      resendApiKey,
      idempotencyKey,
      recipientForLog: userEmail,
      eventId,
      payload: {
        from: 'Meatup.Club Events <events@mail.meatup.club>',
        to: [userEmail],
        subject: `Event Cancelled: ${restaurantName}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 40px 0;">
                  <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <tr>
                      <td style="padding: 40px; text-align: center; background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; font-size: 28px; color: #ffffff;">🥩 Meatup.Club</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px;">
                        <h2 style="margin: 0 0 20px; font-size: 24px; color: #1f2937;">Event Cancelled</h2>
                        <p style="margin: 0 0 24px; font-size: 16px; color: #4b5563; line-height: 1.6;">
                          This event has been cancelled and removed from the schedule.
                        </p>
                        <div style="background-color: #fef2f2; border-left: 4px solid #991b1b; padding: 20px; margin: 0 0 24px; border-radius: 4px;">
                          <p style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #991b1b;">📍 ${restaurantName}</p>
                          ${restaurantAddress ? `<p style="margin: 0 0 12px; font-size: 14px; color: #4b5563;">${restaurantAddress}</p>` : ''}
                          <p style="margin: 0; font-size: 16px; color: #1f2937;">📅 ${new Date(eventDate + 'T' + eventTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date('2000-01-01T' + eventTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                        </div>
                        <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                          A cancellation notice is attached to remove the event from your calendar.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
                          Meatup.Club - Your Quarterly Steakhouse Society
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
        text: `
🥩 Meatup.Club - Event Cancelled

This event has been cancelled.

📍 ${restaurantName}
${restaurantAddress ? restaurantAddress + '\n' : ''}📅 ${new Date(eventDate + 'T' + eventTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date('2000-01-01T' + eventTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}

A cancellation notice is attached to remove the event from your calendar.
        `,
        reply_to: 'rsvp@mail.meatup.club',
        attachments: [
          {
            filename: 'event-cancel.ics',
            content: icsBase64,
            content_type: 'text/calendar; method=CANCEL',
          },
        ],
        headers: {
          'X-Entity-Ref-ID': `event-cancel-${eventId}-${Date.now()}`,
        },
        tags: [
          {
            name: 'category',
            value: 'event_cancel',
          },
        ],
      },
    });
  } catch (error) {
    console.error('Event cancellation email failed', {
      eventId,
      recipient: redactEmail(userEmail),
      message: getErrorMessage(error),
    });
    return { success: false, error: getErrorMessage(error), retryable: true };
  }
}

export async function sendEventCancellation(
  params: EventCancellationParams
): Promise<{ success: boolean; error?: string }> {
  return toLegacySendResult(await sendEventCancellationEmail(params));
}
