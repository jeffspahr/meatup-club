// Email templates for Meatup.Club

interface InviteEmailData {
  inviteeName: string | null;
  inviterName: string;
  acceptLink: string;
}

export function generateInviteEmail(data: InviteEmailData) {
  const displayName = data.inviteeName || 'there';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to Meatup.Club</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 32px; color: #ffffff; font-weight: bold;">
                🥩 Meatup
              </h1>
              <p style="margin: 10px 0 0; font-size: 16px; color: #fecaca;">
                Quarterly steakhouse dinners in Raleigh
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151; line-height: 1.6;">
                Hey ${displayName},
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; color: #374151; line-height: 1.6;">
                <strong>${data.inviterName}</strong> has invited you to join <strong>Meatup.Club</strong> – a group of friends dining quarterly at steakhouses in the Raleigh area.
              </p>

              <div style="background-color: #fef2f2; border-left: 4px solid #991b1b; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0 0 12px; font-size: 15px; color: #7f1d1d; font-weight: 600;">
                  What is Meatup.Club?
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.6;">
                  <li style="margin-bottom: 8px;">Intentional bro time at great steakhouses</li>
                  <li style="margin-bottom: 8px;">Quarterly meetups voted on by members</li>
                  <li style="margin-bottom: 8px;">Suggest restaurants and dates, vote on favorites</li>
                  <li style="margin-bottom: 0;">Family-style dining and good times</li>
                </ul>
              </div>

              <p style="margin: 0 0 24px; font-size: 16px; color: #374151; line-height: 1.6;">
                Interested? Click below to get started:
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0 0 24px;">
                    <a href="${data.acceptLink}" style="display: inline-block; background-color: #991b1b; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(153, 27, 27, 0.2);">
                      Join the Group
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0; font-size: 13px; color: #9ca3af; word-break: break-all;">
                ${data.acceptLink}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 12px; font-size: 12px; color: #6b7280; text-align: center; line-height: 1.5;">
                This invitation was sent by ${data.inviterName} via Meatup.Club
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center; line-height: 1.5;">
                You received this email because ${data.inviterName} invited you to join a private dining club.<br>
                This is a one-time invitation. If you don't want to join, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
Hey ${displayName},

${data.inviterName} invited you to Meatup – a group of friends dining quarterly at steakhouses in the Raleigh area.

What is Meatup?
- Intentional bro time at great steakhouses
- Quarterly meetups voted on by members
- Suggest restaurants and dates, vote on favorites
- Family-style dining and good times

Interested? Join here:
${data.acceptLink}

---
This invitation was sent by ${data.inviterName}
You received this because they thought you'd enjoy quarterly steakhouse dinners with the group.
  `.trim();

  return {
    html,
    text,
    subject: `${data.inviterName} invited you to Meatup`,
  };
}

interface CommentReplyEmailData {
  recipientName: string | null;
  replierName: string;
  originalComment: string;
  replyContent: string;
  pollUrl: string;
}

export function generateCommentReplyEmail(data: CommentReplyEmailData) {
  const displayName = data.recipientName || 'there';
  const truncatedOriginal = data.originalComment.length > 100
    ? data.originalComment.substring(0, 100) + '...'
    : data.originalComment;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.replierName} replied to your comment</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 28px; color: #ffffff; font-weight: bold;">
                💬 New Reply
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151; line-height: 1.6;">
                Hey ${displayName},
              </p>

              <p style="margin: 0 0 24px; font-size: 16px; color: #374151; line-height: 1.6;">
                <strong>${data.replierName}</strong> replied to your comment on Meatup.Club:
              </p>

              <!-- Original Comment -->
              <div style="background-color: #f9fafb; border-left: 4px solid #d1d5db; padding: 16px; margin: 0 0 20px; border-radius: 4px;">
                <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">
                  Your Comment
                </p>
                <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
                  ${truncatedOriginal}
                </p>
              </div>

              <!-- Reply -->
              <div style="background-color: #fef2f2; border-left: 4px solid: #991b1b; padding: 16px; margin: 0 0 24px; border-radius: 4px;">
                <p style="margin: 0 0 8px; font-size: 12px; color: #7f1d1d; font-weight: 600; text-transform: uppercase;">
                  ${data.replierName}'s Reply
                </p>
                <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">
                  ${data.replyContent}
                </p>
              </div>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0 0 24px;">
                    <a href="${data.pollUrl}" style="display: inline-block; background-color: #991b1b; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(153, 27, 27, 0.2);">
                      View Conversation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0; font-size: 13px; color: #9ca3af; word-break: break-all;">
                ${data.pollUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 12px; font-size: 12px; color: #6b7280; text-align: center; line-height: 1.5;">
                You're receiving this because someone replied to your comment
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center; line-height: 1.5;">
                Manage your notification preferences in your <a href="${data.pollUrl.split('/dashboard')[0]}/dashboard/profile" style="color: #991b1b; text-decoration: none;">profile settings</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
Hey ${displayName},

${data.replierName} replied to your comment on Meatup.Club:

Your Comment:
${truncatedOriginal}

${data.replierName}'s Reply:
${data.replyContent}

View the full conversation:
${data.pollUrl}

---
You're receiving this because someone replied to your comment.
Manage your notification preferences in your profile settings.
  `.trim();

  return {
    html,
    text,
    subject: `${data.replierName} replied to your comment`,
  };
}
