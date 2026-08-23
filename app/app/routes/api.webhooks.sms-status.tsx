import type { Route } from "./+types/api.webhooks.sms-status";
import {
  parseTwilioMessageStatus,
  recordPollSmsDeliveryStatus,
  recordSmsDeliveryStatus,
  verifyTwilioSignature,
} from "../lib/sms.server";

const DELIVERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_SID_PATTERN = /^SM[a-fA-F0-9]{32}$/;

export async function action({ request, context }: Route.ActionArgs) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response("Invalid callback payload", { status: 400 });
  }
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      params.append(key, value);
    }
  }

  const isValid = verifyTwilioSignature({
    url: request.url,
    params,
    signature: request.headers.get("X-Twilio-Signature"),
    authToken: context.cloudflare.env.TWILIO_AUTH_TOKEN,
  });
  if (!isValid) {
    return new Response("Invalid signature", { status: 403 });
  }

  const deliveryId = new URL(request.url).searchParams.get("delivery_id")?.trim() || "";
  const deliveryKind = new URL(request.url).searchParams.get("delivery_kind")?.trim() || "event";
  const messageSid = formData.get("MessageSid")?.toString().trim() || "";
  const status = parseTwilioMessageStatus(
    formData.get("MessageStatus")?.toString() || formData.get("SmsStatus")?.toString() || null
  );
  const errorCode = formData.get("ErrorCode")?.toString().trim() || null;

  if (
    !DELIVERY_ID_PATTERN.test(deliveryId) ||
    !MESSAGE_SID_PATTERN.test(messageSid) ||
    !status ||
    (deliveryKind !== "event" && deliveryKind !== "poll")
  ) {
    return new Response("Invalid callback payload", { status: 400 });
  }

  const recordStatus = deliveryKind === "poll"
    ? recordPollSmsDeliveryStatus
    : recordSmsDeliveryStatus;
  const recorded = await recordStatus({
    db: context.cloudflare.env.DB,
    deliveryId,
    messageSid,
    status,
    errorCode,
  });

  if (!recorded) {
    return new Response("Unknown delivery", { status: 404 });
  }

  return new Response(null, { status: 204 });
}
