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
): Promise<string[]> {
  if (!data.email_id) {
    // Preserve compatibility with older inline-body deliveries.
    if (data.text == null && data.html == null) {
      throw new Error("Received email is missing its email_id and content");
    }
    return [data.text || "", data.html || ""];
  }
  if (!apiKey) throw new Error("Resend receiving API key is not configured");

  const emailPath = encodeURIComponent(data.email_id);
  const email = await getResendJson<ReceivedEmailData>(emailPath, apiKey);
  const calendars = (email.attachments ?? data.attachments ?? []).filter(attachment =>
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
  return contents.length ? contents : [email.text || "", email.html || ""];
}
