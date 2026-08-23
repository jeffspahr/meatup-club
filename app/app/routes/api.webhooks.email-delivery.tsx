import type { RouterContextProvider } from "react-router";
import { Webhook } from "svix";
import { applyResendDeliveryWebhookEvent } from "../lib/event-email-delivery.server";
import { getProviderWebhookConfig } from "../lib/provider-webhooks.server";
import { reserveWebhookDelivery } from "../lib/webhook-idempotency.server";
import { logErrorEvent } from "../lib/observability.server";
import { getCloudflareContext } from "~/lib/router-context";

interface ResendDeliveryWebhookPayload {
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

async function getWebhookSecret(
  context: Readonly<RouterContextProvider>
): Promise<string | null> {
  const db = getCloudflareContext(context).env.DB;
  const storedConfig = await getProviderWebhookConfig(db, "resend", "delivery_status");
  return storedConfig?.signingSecret || getCloudflareContext(context).env.RESEND_DELIVERY_WEBHOOK_SECRET || null;
}

/**
 * Webhook handler for Resend delivery-status events.
 */
export async function action({
  request,
  context,
}: {
  request: Request;
  context: Readonly<RouterContextProvider>;
}) {
  const db = getCloudflareContext(context).env.DB;

  try {
    const webhookSecret = await getWebhookSecret(context);
    if (!webhookSecret) {
      logErrorEvent("resend_delivery_webhook_secret_missing");
      return Response.json({ error: "Webhook not configured" }, { status: 500 });
    }

    const body = await request.text();
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return Response.json({ error: "Missing signature headers" }, { status: 401 });
    }

    let payload: ResendDeliveryWebhookPayload;
    try {
      const webhook = new Webhook(webhookSecret);
      payload = webhook.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ResendDeliveryWebhookPayload;
    } catch (error) {
      logErrorEvent("resend_delivery_webhook_signature_invalid", error);
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const isFirstDelivery = await reserveWebhookDelivery(db, "resend_delivery", svixId);
    if (!isFirstDelivery) {
      return Response.json({ message: "Duplicate webhook ignored" });
    }

    const result = await applyResendDeliveryWebhookEvent(db, payload);
    if (!result.handled) {
      return Response.json({ message: "Ignored: unsupported delivery event type" });
    }

    return Response.json({
      success: true,
      message: result.updated ? "Delivery state updated" : "Delivery event recorded",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logErrorEvent("resend_delivery_webhook_failed", error);
    return Response.json(
      {
        success: false,
        error: "Failed to process delivery webhook",
        message,
      },
      { status: 500 }
    );
  }
}
