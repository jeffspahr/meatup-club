interface ReceivedAttachment {
  id: string;
  filename: string | null;
  content_type: string;
  size?: number;
}

export interface ReceivedEmailData {
  email_id?: string;
  from: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  attachments?: ReceivedAttachment[];
}

interface AuthenticatedCalendarReply {
  from: string;
  subject: string;
  contents: string[];
}

export class UnauthenticatedReceivedEmailError extends Error {}

const MAX_CALENDAR_BYTES = 1024 * 1024;

async function getResendJson<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`https://api.resend.com/emails/receiving/${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // Do not include provider bodies, which can contain private email content.
    throw new Error(`Resend receiving API failed (HTTP ${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function downloadCalendar(url: string): Promise<string> {
  if (new URL(url).protocol !== "https:") {
    throw new Error("Invalid calendar attachment download URL");
  }
  // The signed URL comes from Resend; never forward the API key to its CDN.
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok || !response.body) {
    throw new Error(`Calendar attachment download failed (HTTP ${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let content = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_CALENDAR_BYTES) {
        await reader.cancel();
        throw new Error("Calendar attachment exceeds size limit");
      }
      content += decoder.decode(value, { stream: true });
    }
    return content + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** Resend webhooks contain metadata only; bodies and attachments need separate reads. */
export async function getReceivedCalendarContents(
  data: ReceivedEmailData,
  apiKey: string | undefined,
): Promise<AuthenticatedCalendarReply> {
  if (!data.email_id) {
    throw new UnauthenticatedReceivedEmailError("Received email requires an email_id");
  }
  if (!apiKey) throw new Error("Resend receiving API key is not configured");

  const emailPath = encodeURIComponent(data.email_id);
  const email = await getResendJson<ReceivedEmailData & {
    authentication?: { dkim?: string; dmarc?: string } | null;
  }>(emailPath, apiKey);
  // These server-computed results include From-domain alignment; SPF alone does not.
  // https://resend.com/docs/api-reference/emails/retrieve-received-email
  if (!email || (email.authentication?.dkim !== "pass" && email.authentication?.dmarc !== "pass")) {
    throw new UnauthenticatedReceivedEmailError("Received email sender is not authenticated");
  }
  // Use the receiving API's canonical mailbox, never a display-name header.
  if (typeof email.from !== "string" || !/^[^\s\x00-\x1f\x7f<>@(),;:"\\]+@[^\s\x00-\x1f\x7f<>@(),;:"\\]+$/.test(email.from)
    || typeof email.subject !== "string") {
    throw new UnauthenticatedReceivedEmailError("Received email sender is invalid");
  }
  const calendars = (email.attachments ?? []).filter(attachment =>
    /^text\/calendar(?:;|$)/i.test(attachment.content_type) || /\.ics$/i.test(attachment.filename || ""),
  );
  const contents: string[] = [];
  for (const attachment of calendars) {
    if ((attachment.size ?? 0) > MAX_CALENDAR_BYTES) {
      throw new Error("Calendar attachment exceeds size limit");
    }
    const details = await getResendJson<{ download_url: string }>(
      `${emailPath}/attachments/${encodeURIComponent(attachment.id)}`, apiKey,
    );
    contents.push(await downloadCalendar(details.download_url));
  }
  // A reply attachment is authoritative; do not parse a quoted invitation body instead.
  return {
    from: email.from.toLowerCase(),
    subject: email.subject,
    contents: contents.length ? contents : [email.text || "", email.html || ""],
  };
}
