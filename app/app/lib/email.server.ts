// Email sending utilities using Resend

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

function replaceVariables(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
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
      const error = await response.text();
      console.error('Resend API error:', error);
      return { success: false, error: `Failed to send email: ${response.statusText}` };
    }

    const data = await response.json();
    console.log('Email sent successfully:', data);
    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
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
      const error = await response.text();
      console.error('Resend API error:', error);
      return { success: false, error: `Failed to send email: ${response.statusText}` };
    }

    const data = await response.json();
    console.log('Comment reply email sent successfully:', data);
    return { success: true };
  } catch (error) {
    console.error('Comment reply email error:', error);
    return { success: false, error: 'Failed to send comment reply notification' };
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
}: {
  eventId: number;
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime?: string;
  attendeeEmail: string;
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
    'SEQUENCE:0',
    'ORGANIZER;CN=Meatup.Club:mailto:rsvp@mail.meatup.club',
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${attendeeEmail}:mailto:${attendeeEmail}`,
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

  // Send to each recipient individually (better for tracking and personalized ATTENDEE)
  for (const email of recipientEmails) {
    try {
      // Generate personalized calendar invite for this recipient
      const personalizedIcsContent = generateCalendarInvite({
        eventId,
        restaurantName,
        restaurantAddress,
        eventDate,
        eventTime,
        attendeeEmail: email,
      });

      const personalizedIcsBase64 = Buffer.from(personalizedIcsContent).toString('base64');

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Meatup.Club Events <events@mail.meatup.club>',
          to: [email],
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
                            ${restaurantAddress ? `<p style="margin: 0 0 12px; font-size: 14px; color: #4b5563;">${restaurantAddress}</p>` : ''}
                            <p style="margin: 0; font-size: 16px; color: #1f2937;">📅 ${new Date(eventDate + 'T' + eventTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date('2000-01-01T' + eventTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                          </div>
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            <tr>
                              <td align="center" style="padding: 0 0 24px;">
                                <a href="https://meatup.club/dashboard/rsvp" style="display: inline-block; background-color: #991b1b; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(153, 27, 27, 0.2);">
                                  RSVP Now
                                </a>
                              </td>
                            </tr>
                          </table>
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
${restaurantAddress ? restaurantAddress + '\n' : ''}📅 ${new Date(eventDate + 'T' + eventTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date('2000-01-01T' + eventTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}

RSVP at: https://meatup.club/dashboard/rsvp

A calendar invite is attached to this email.
          `,
          reply_to: 'rsvp@mail.meatup.club',
          attachments: [
            {
              filename: 'event.ics',
              content: personalizedIcsBase64,
              content_type: 'text/calendar; method=REQUEST',
            },
          ],
          headers: {
            'X-Entity-Ref-ID': `event-${eventId}-${Date.now()}`,
          },
          tags: [
            {
              name: 'category',
              value: 'event_invite',
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`Failed to send to ${email}:`, error);
        errors.push(`${email}: ${response.statusText}`);
      } else {
        sentCount++;
        console.log(`Calendar invite sent to ${email}`);
      }
    } catch (error) {
      console.error(`Error sending to ${email}:`, error);
      errors.push(`${email}: ${error}`);
    }
  }

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

    const description = `Join us for our quarterly meatup at ${restaurantName}!${restaurantAddress ? `\\n\\nLocation: ${restaurantAddress}` : ''}\\n\\nRSVP and view details at https://meatup.club/dashboard/rsvp`;

    // Map website RSVP status to calendar PARTSTAT
    const partstatMap: Record<string, string> = {
      'yes': 'ACCEPTED',
      'no': 'DECLINED',
      'maybe': 'TENTATIVE',
    };

    const partstat = partstatMap[rsvpStatus] || 'NEEDS-ACTION';

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
      const error = await response.text();
      console.error('Failed to send calendar update:', error);
      return { success: false, error: `Failed to send update: ${response.statusText}` };
    }

    console.log(`Calendar update sent to ${userEmail} for event ${eventId}`);
    return { success: true };
  } catch (error) {
    console.error('Calendar update error:', error);
    return { success: false, error: String(error) };
  }
}
