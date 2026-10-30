import type { ReceivedEmailData } from "./received-email.server";

interface DeliveryPayload {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    reason?: string;
    response?: string;
    created_at?: string;
  };
}

interface ReceivedPayload {
  type: string;
  data: ReceivedEmailData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

// Call only after verifying the signature against the unchanged raw body.
export function parseDeliveryPayload(body: string): DeliveryPayload {
  const payload: unknown = JSON.parse(body);
  if (!isRecord(payload) || typeof payload.type !== "string" || !payload.type ||
      !optionalString(payload.created_at)) {
    throw new Error("Invalid delivery payload");
  }
  const data = payload.data;
  if (data !== undefined && (!isRecord(data) ||
      ![data.email_id, data.reason, data.response, data.created_at].every(optionalString) ||
      !(optionalString(data.to) || (Array.isArray(data.to) && data.to.every(to => typeof to === "string"))))) {
    throw new Error("Invalid delivery data");
  }
  return { ...payload, type: payload.type } as DeliveryPayload;
}

export function parseReceivedPayload(body: string): ReceivedPayload | null {
  const payload: unknown = JSON.parse(body);
  if (!isRecord(payload) || typeof payload.type !== "string" || !payload.type) {
    throw new Error("Invalid received email payload");
  }
  // Other signed event types are ignored by the route before accessing data.
  if (payload.type !== "email.received") {
    return null;
  }
  const data = payload.data;
  if (!isRecord(data) || typeof data.from !== "string" || !data.from.trim() ||
      typeof data.subject !== "string" || !optionalString(data.email_id) ||
      ![data.text, data.html].every(value => value === null || optionalString(value)) ||
      (data.attachments !== undefined && (!Array.isArray(data.attachments) ||
        !data.attachments.every(attachment => isRecord(attachment) &&
          typeof attachment.id === "string" &&
          (attachment.filename === null || typeof attachment.filename === "string") &&
          typeof attachment.content_type === "string" &&
          (attachment.size === undefined || (typeof attachment.size === "number" && attachment.size >= 0)))))) {
    throw new Error("Invalid received email data");
  }
  return { ...payload, type: payload.type, data: { ...data, from: data.from, subject: data.subject } } as ReceivedPayload;
}
