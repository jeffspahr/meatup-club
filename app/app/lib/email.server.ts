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
